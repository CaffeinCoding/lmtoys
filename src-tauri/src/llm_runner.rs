use std::process::{Command, Stdio, Child};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State, Manager};
use std::io::{BufReader, BufRead};
use std::thread;

pub struct LlmState {
    pub process: Mutex<Option<Child>>,
    #[cfg(windows)]
    pub job_handle: Mutex<Option<usize>>,
}

impl LlmState {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            #[cfg(windows)]
            job_handle: Mutex::new(None),
        }
    }
}

#[derive(Clone, serde::Serialize)]
struct LlmEvent {
    status: String,
    message: String,
}

#[tauri::command]
pub async fn start_llama_server(
    runtime: String,
    port: u16,
    model: String,
    ctx_size: u32,
    ngl: u32,
    app: AppHandle,
    state: State<'_, LlmState>,
) -> Result<(), String> {
    // 1. Check if already running
    {
        let process_guard = state.process.lock().unwrap();
        if process_guard.is_some() {
            return Err("Server is already running".into());
        }
    }

    // 2. Resolve executable path
    let exe_name = if cfg!(target_os = "windows") { "llama-server.exe" } else { "llama-server" };
    let resource_path = format!("resources/bin/{}/{}", runtime, exe_name);
    
    let exe_path = app.path().resolve(
        &resource_path, 
        tauri::path::BaseDirectory::Resource
    ).map_err(|e| format!("Failed to resolve path: {}", e))?;

    tracing::info!("Resolved resource path {} to {:?}", resource_path, exe_path);

    if !exe_path.exists() {
        tracing::error!("Runtime executable not found at {:?}", exe_path);
        // Fallback: try relative to current directory if in dev mode
        let fallback_path = std::env::current_dir().unwrap().join("resources").join("bin").join(&runtime).join(exe_name);
        tracing::info!("Trying fallback path: {:?}", fallback_path);
        
        if fallback_path.exists() {
            tracing::info!("Fallback path exists! Using it.");
            let mut cmd = Command::new(&fallback_path);
            cmd.arg("--port").arg(port.to_string())
               .arg("-m").arg(&model)
               .arg("-c").arg(ctx_size.to_string())
               .arg("-ngl").arg(ngl.to_string())
               .stdout(Stdio::piped())
               .stderr(Stdio::piped());

            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            let child = cmd.spawn().map_err(|e| format!("Failed to start llama-server at fallback: {}", e))?;
            return handle_child_process(child, app, state);
        } else {
            let fallback_path2 = std::env::current_dir().unwrap().join("src-tauri").join("resources").join("bin").join(&runtime).join(exe_name);
            tracing::info!("Trying fallback path 2: {:?}", fallback_path2);
            if fallback_path2.exists() {
                tracing::info!("Fallback path 2 exists! Using it.");
                let mut cmd = Command::new(&fallback_path2);
                cmd.arg("--port").arg(port.to_string())
                   .arg("-m").arg(&model)
                   .arg("-c").arg(ctx_size.to_string())
                   .arg("-ngl").arg(ngl.to_string())
                   .stdout(Stdio::piped())
                   .stderr(Stdio::piped());

                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    cmd.creation_flags(CREATE_NO_WINDOW);
                }

                let child = cmd.spawn().map_err(|e| format!("Failed to start llama-server at fallback 2: {}", e))?;
                return handle_child_process(child, app, state);
            }
        }
        
        return Err(format!("Runtime executable not found: {:?} (and fallbacks failed)", exe_path));
    }

    // 3. Spawn process
    let mut cmd = Command::new(&exe_path);
    cmd.current_dir(exe_path.parent().unwrap())
       .arg("--port").arg(port.to_string())
       .arg("-m").arg(&model)
       .arg("-c").arg(ctx_size.to_string())
       .arg("-ngl").arg(ngl.to_string())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        // On Windows, hide the console window for the child process
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn().map_err(|e| format!("Failed to start llama-server: {}", e))?;
    handle_child_process(child, app, state)
}

fn handle_child_process(mut child: Child, app: AppHandle, state: State<'_, LlmState>) -> Result<(), String> {
    // 4. Job Object (Windows) to prevent zombie processes
    #[cfg(windows)]
    {
        use std::os::windows::io::AsRawHandle;
        use windows::Win32::System::JobObjects::{CreateJobObjectW, SetInformationJobObject, JobObjectExtendedLimitInformation, JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, AssignProcessToJobObject};
        use windows::Win32::Foundation::{HANDLE, CloseHandle};

        unsafe {
            if let Ok(job) = CreateJobObjectW(None, None) {
                let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

                let res = SetInformationJobObject(
                    job,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const std::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );

                if res.is_ok() {
                    let child_handle = HANDLE(child.as_raw_handle() as isize);
                    if AssignProcessToJobObject(job, child_handle).is_ok() {
                        let mut job_guard = state.job_handle.lock().unwrap();
                        *job_guard = Some(job.0 as usize);
                    } else {
                        let _ = CloseHandle(job);
                    }
                } else {
                    let _ = CloseHandle(job);
                }
            }
        }
    }

    // 5. Pipe output to frontend
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    
    let app_clone1 = app.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                let _ = app_clone1.emit("llm-log", LlmEvent { status: "stdout".into(), message: line });
            }
        }
    });

    let app_clone2 = app.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                let _ = app_clone2.emit("llm-log", LlmEvent { status: "stderr".into(), message: line.clone() });
                
                // Crash detection logic (simple)
                let l_lower = line.to_lowercase();
                if l_lower.contains("error") || l_lower.contains("failed") || l_lower.contains("exception") {
                    let _ = app_clone2.emit("llm-crash", LlmEvent { status: "crash".into(), message: line });
                }
            }
        }
    });

    // 6. Monitor process exit
    let app_clone3 = app.clone();
    thread::spawn(move || {
        // Wait a bit to let the process start
        thread::sleep(std::time::Duration::from_millis(500));
        
        loop {
            // Check if process is still running by trying to get its status
            // But we don't have direct access to `child.wait()` because it's stored in `LlmState`.
            // We can lock the state and call `try_wait()`.
            let mut exited = false;
            let mut exit_code = None;
            
            {
                let state = app_clone3.state::<LlmState>();
                let mut process_guard = state.process.lock().unwrap();
                if let Some(ref mut c) = *process_guard {
                    match c.try_wait() {
                        Ok(Some(status)) => {
                            exited = true;
                            exit_code = status.code();
                            // Process finished, clear it from state
                            // We cannot take it here easily if we want to also close job object, but let's just leave it or let stop_llama_server handle it.
                        }
                        Ok(None) => {
                            // Still running
                        }
                        Err(_) => {
                            // Error trying to wait, assume exited
                            exited = true;
                        }
                    }
                } else {
                    // Process already cleared from state (e.g. stop_server called)
                    break;
                }
            }
            
            if exited {
                let _ = app_clone3.emit("llm-crash", LlmEvent { 
                    status: "offline".into(), 
                    message: format!("Process exited unexpectedly (Code: {:?}). The executable might be incompatible or missing dependencies.", exit_code)
                });
                break;
            }
            
            thread::sleep(std::time::Duration::from_millis(500));
        }
    });

    // 7. Store child in state
    {
        let mut process_guard = state.process.lock().unwrap();
        *process_guard = Some(child);
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_llama_server(state: State<'_, LlmState>) -> Result<(), String> {
    let mut process_guard = state.process.lock().unwrap();
    if let Some(mut child) = process_guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    
    #[cfg(windows)]
    {
        let mut job_guard = state.job_handle.lock().unwrap();
        if let Some(job) = job_guard.take() {
            use windows::Win32::Foundation::{HANDLE, CloseHandle};
            unsafe {
                let _ = CloseHandle(HANDLE(job as isize));
            }
        }
    }
    
    Ok(())
}

pub fn kill_server_on_exit(state: &LlmState) {
    let mut process_guard = state.process.lock().unwrap();
    if let Some(mut child) = process_guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}
