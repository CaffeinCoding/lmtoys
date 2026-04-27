use sysinfo::System;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager, State};
use futures_util::StreamExt;
use std::fs::File;
use std::io::Write;
use std::sync::Mutex;
use std::collections::HashMap;
use futures_util::future::{AbortHandle, Abortable};

mod llm_runner;

#[derive(Clone, serde::Serialize)]
struct DownloadProgress {
    filename: String,
    downloaded: u64,
    total: Option<u64>,
}

pub struct DownloadState {
    pub handles: Mutex<HashMap<String, AbortHandle>>,
}

impl DownloadState {
    pub fn new() -> Self {
        Self {
            handles: Mutex::new(HashMap::new()),
        }
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Returns a list of GPU runtimes supported by this binary build.
#[tauri::command]
fn get_supported_runtimes() -> Vec<String> {
    vec![
        "cpu".to_string(),
        "vulkan".to_string(),
        "cuda12".to_string()
    ]
}

#[tauri::command]
fn get_system_memory() -> serde_json::Value {
    let mut sys = System::new_all();
    sys.refresh_memory();
    serde_json::json!({
        "total": sys.total_memory(),
        "used": sys.used_memory()
    })
}

#[tauri::command]
fn get_system_vram() -> serde_json::Value {
    use std::process::Command;
    
    let mut cmd = Command::new("nvidia-smi");
    cmd.args(&["--query-gpu=memory.total,memory.used", "--format=csv,noheader,nounits"]);
    
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    if let Ok(output) = cmd.output() 
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let parts: Vec<&str> = stdout.trim().split(',').collect();
            if parts.len() == 2 {
                if let (Ok(total_mb), Ok(used_mb)) = (parts[0].trim().parse::<u64>(), parts[1].trim().parse::<u64>()) {
                    return serde_json::json!({
                        "total": total_mb * 1024 * 1024,
                        "used": used_mb * 1024 * 1024
                    });
                }
            }
        }
    }
    
    serde_json::json!(null)
}

#[tauri::command]
async fn extract_pdf_text(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    match pdf_extract::extract_text(path) {
        Ok(text) => {
            if text.trim().is_empty() {
                Err("No text could be extracted from this PDF.".into())
            } else {
                Ok(text)
            }
        },
        Err(e) => Err(format!("Failed to extract text: {:?}", e)),
    }
}

#[tauri::command]
async fn cancel_download(
    filename: String,
    state: State<'_, DownloadState>
) -> Result<(), String> {
    let mut handles = state.handles.lock().unwrap();
    if let Some(handle) = handles.remove(&filename) {
        handle.abort();
        tracing::info!("Aborted download for {}", filename);
    }
    Ok(())
}

#[tauri::command]
async fn download_model(
    url: String, 
    path: String, 
    filename: String, 
    repo: String, 
    token: Option<String>, 
    app: tauri::AppHandle,
    state: State<'_, DownloadState>
) -> Result<(), String> {
    let parts: Vec<&str> = repo.split('/').collect();
    let owner = parts.get(0).unwrap_or(&"unknown");
    let repo_name = parts.get(1).unwrap_or(&"model");
    
    let mut dest_dir = PathBuf::from(&path);
    dest_dir.push(owner);
    dest_dir.push(repo_name);
    
    if !dest_dir.exists() {
        std::fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    }
    
    let mut dest_path = dest_dir.clone();
    dest_path.push(&filename);
    
    let client = reqwest::Client::new();
    let mut request = client.get(&url);
    
    if let Some(t) = token {
        if !t.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", t));
        }
    }

    let res = request.send().await.map_err(|e| e.to_string())?;
    let total_size = res.content_length();
    
    let (abort_handle, abort_registration) = AbortHandle::new_pair();
    {
        let mut handles = state.handles.lock().unwrap();
        handles.insert(filename.clone(), abort_handle);
    }

    let dest_path_clone = dest_path.clone();
    let filename_clone = filename.clone();
    let app_clone = app.clone();

    let download_task = async move {
        let mut file = File::create(&dest_path_clone).map_err(|e| e.to_string())?;
        let mut downloaded: u64 = 0;
        let mut stream = res.bytes_stream();
        
        let mut last_emit = std::time::Instant::now();
        
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            
            if last_emit.elapsed().as_millis() > 100 {
                let _ = app_clone.emit("download_progress", DownloadProgress {
                    filename: filename_clone.clone(),
                    downloaded,
                    total: total_size,
                });
                last_emit = std::time::Instant::now();
            }
        }
        
        Ok::<(), String>(())
    };

    let result = Abortable::new(download_task, abort_registration).await;
    
    // Cleanup handle
    {
        let mut handles = state.handles.lock().unwrap();
        handles.remove(&filename);
    }

    match result {
        Ok(res) => {
            if res.is_ok() {
                let _ = app.emit("download_progress", DownloadProgress {
                    filename: filename.clone(),
                    downloaded: total_size.unwrap_or(0),
                    total: total_size,
                });
            }
            res
        },
        Err(_) => {
            if dest_path.exists() {
                let _ = std::fs::remove_file(&dest_path);
            }
            
            // Try to remove empty parent directories up to root_path
            let mut current_dir = dest_path.parent();
            let root_path = PathBuf::from(&path);
            while let Some(dir) = current_dir {
                if dir == root_path || !dir.starts_with(&root_path) {
                    break;
                }
                
                if let Ok(entries) = std::fs::read_dir(dir) {
                    if entries.count() == 0 {
                        let _ = std::fs::remove_dir(dir);
                        current_dir = dir.parent();
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }

            Err("Download cancelled by user".into())
        }
    }
}

#[derive(serde::Serialize)]
struct ModelInfo {
    name: String,
    repo: String,
    has_vision: bool,
}

#[tauri::command]
fn get_downloaded_models(path: String) -> Result<Vec<ModelInfo>, String> {
    let mut models = Vec::new();
    let root_dir = Path::new(&path);
    
    if !root_dir.exists() || !root_dir.is_dir() {
        return Ok(models);
    }

    fn scan_dir(current_dir: &Path, root_dir: &Path, models: &mut Vec<ModelInfo>) {
        if let Ok(entries) = std::fs::read_dir(current_dir) {
            let entries_vec: Vec<_> = entries.flatten().collect();
            
            let has_vision = entries_vec.iter().any(|e| {
                e.file_name().to_string_lossy().to_lowercase().contains("mmproj")
            });

            for entry in entries_vec {
                let p = entry.path();
                if p.is_dir() {
                    scan_dir(&p, root_dir, models);
                } else if p.is_file() {
                    if let Some(ext) = p.extension() {
                        let ext_str = ext.to_string_lossy().to_lowercase();
                        if ext_str == "gguf" || ext_str == "bin" {
                            let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                            if !file_name.to_lowercase().contains("mmproj") {
                                if let Ok(rel_path) = p.strip_prefix(root_dir) {
                                    let rel_path_str = rel_path.to_string_lossy().replace('\\', "/");
                                    let repo = rel_path.parent()
                                        .map(|parent| parent.to_string_lossy().replace('\\', "/"))
                                        .unwrap_or_default();

                                    models.push(ModelInfo {
                                        name: rel_path_str,
                                        repo,
                                        has_vision,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    scan_dir(root_dir, root_dir, &mut models);
    Ok(models)
}

#[tauri::command]
fn delete_model(path: String, filename: String) -> Result<(), String> {
    let root_path = PathBuf::from(&path);
    let mut dest_path = root_path.clone();
    dest_path.push(&filename); 
    
    if dest_path.exists() {
        std::fs::remove_file(&dest_path).map_err(|e| e.to_string())?;
        
        let mut setting_path = dest_path.clone();
        let file_name_os = setting_path.file_name().unwrap().to_owned();
        let file_name_str = file_name_os.to_string_lossy();
        setting_path.set_file_name(format!("{}_setting.json", file_name_str));
        
        if setting_path.exists() {
            let _ = std::fs::remove_file(&setting_path);
        }
        
        if let Some(parent) = dest_path.parent() {
            if let Ok(entries) = std::fs::read_dir(parent) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() {
                        let f_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                        if f_name.contains("mmproj") {
                            let _ = std::fs::remove_file(&p);
                        }
                    }
                }
            }
        }

        let mut current_dir = dest_path.parent();
        while let Some(dir) = current_dir {
            if dir == root_path || !dir.starts_with(&root_path) {
                break;
            }
            
            if let Ok(entries) = std::fs::read_dir(dir) {
                if entries.count() == 0 {
                    let _ = std::fs::remove_dir(dir);
                    current_dir = dir.parent();
                } else {
                    break;
                }
            } else {
                break;
            }
        }
    }
    
    Ok(())
}

#[tauri::command]
fn get_all_files_in_dir(path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let dir = Path::new(&path);
    if dir.exists() && dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if entry.path().is_file() {
                    if let Some(name) = entry.file_name().to_str() {
                        files.push(name.to_string());
                    }
                }
            }
        }
    }
    Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env().add_directive("tauri_app_lib=info".parse().unwrap()))
        .init();

    let llm_state = llm_runner::LlmState::new();
    let download_state = DownloadState::new();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(llm_state)
        .manage(download_state)
        .invoke_handler(tauri::generate_handler![
            greet, 
            get_system_memory,
            get_system_vram,
            extract_pdf_text,
            download_model,
            cancel_download,
            get_downloaded_models,
            delete_model,
            get_all_files_in_dir,
            get_supported_runtimes,
            llm_runner::start_llama_server,
            llm_runner::stop_llama_server,
            llm_runner::get_llama_server_status
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    builder.run(|app_handle, event| match event {
        tauri::RunEvent::Exit => {
            let state = app_handle.state::<llm_runner::LlmState>();
            llm_runner::kill_server_on_exit(&state);
        }
        _ => {}
    });
}
