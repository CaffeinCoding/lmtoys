use sysinfo::System;
use std::path::PathBuf;
use tauri::{Emitter, Manager};
use futures_util::StreamExt;
use std::fs::File;
use std::io::Write;

mod llm_runner;

#[derive(Clone, serde::Serialize)]
struct DownloadProgress {
    filename: String,
    downloaded: u64,
    total: Option<u64>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Returns a list of GPU runtimes supported by this binary build.
/// In the 2-layer architecture, these rely on bundled `llama-server` executables.
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
    // Attempt to use nvidia-smi to get VRAM. 
    // Returns { total: <bytes>, used: <bytes> } or null if not available.
    use std::process::Command;
    
    if let Ok(output) = Command::new("nvidia-smi")
        .args(&["--query-gpu=memory.total,memory.used", "--format=csv,noheader,nounits"])
        .output() 
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
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".into());
    }

    match pdf_extract::extract_text(path) {
        Ok(text) => Ok(text),
        Err(e) => Err(format!("Failed to extract text: {:?}", e)),
    }
}

#[tauri::command]
async fn download_model(url: String, path: String, filename: String, token: Option<String>, app: tauri::AppHandle) -> Result<(), String> {
    let mut dest_path = PathBuf::from(&path);
    if !dest_path.exists() {
        std::fs::create_dir_all(&dest_path).map_err(|e| e.to_string())?;
    }
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
    
    let mut file = File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();
    
    let mut last_emit = std::time::Instant::now();
    
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        
        // Emit progress at most once per 100ms to avoid overwhelming the frontend
        if last_emit.elapsed().as_millis() > 100 {
            let _ = app.emit("download_progress", DownloadProgress {
                filename: filename.clone(),
                downloaded,
                total: total_size,
            });
            last_emit = std::time::Instant::now();
        }
    }
    
    // Final emit
    let _ = app.emit("download_progress", DownloadProgress {
        filename: filename.clone(),
        downloaded,
        total: total_size,
    });
    
    Ok(())
}

#[tauri::command]
fn get_downloaded_models(path: String) -> Result<Vec<String>, String> {
    let mut models = Vec::new();
    let dir = std::path::Path::new(&path);
    if dir.exists() && dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(ext) = path.extension() {
                            if ext == "gguf" || ext == "bin" {
                                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                                    models.push(name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(models)
}

#[tauri::command]
fn delete_model(path: String, filename: String) -> Result<(), String> {
    let mut dest_path = PathBuf::from(&path);
    dest_path.push(&filename);
    if dest_path.exists() {
        std::fs::remove_file(&dest_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_all_files_in_dir(path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let dir = std::path::Path::new(&path);
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

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(llm_state)
        .invoke_handler(tauri::generate_handler![
            greet, 
            get_system_memory,
            get_system_vram,
            extract_pdf_text,
            download_model,
            get_downloaded_models,
            delete_model,
            get_all_files_in_dir,
            get_supported_runtimes,
            llm_runner::start_llama_server,
            llm_runner::stop_llama_server
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
