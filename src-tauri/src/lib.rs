use sysinfo::System;
use std::path::PathBuf;
use tauri::Emitter;
use futures_util::StreamExt;
use std::fs::File;
use std::io::Write;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::{LlamaModel, AddBos};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::sampling::LlamaSampler;

#[derive(Clone, serde::Serialize)]
struct DownloadProgress {
    filename: String,
    downloaded: u64,
    total: Option<u64>,
}

#[derive(serde::Serialize)]
struct GgufMetadata {
    architecture: String,
    context_length: u64,
    has_vision: bool,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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

#[tauri::command]
fn get_gguf_metadata(path: String, filename: String) -> Result<GgufMetadata, String> {
    let mut dest_path = PathBuf::from(&path);
    dest_path.push(filename);
    
    let backend = LlamaBackend::init().map_err(|e| e.to_string())?;
    let mut params = LlamaModelParams::default();
    params = params.with_vocab_only(true);

    let model = LlamaModel::load_from_file(&backend, &dest_path, &params).map_err(|e| format!("Failed to load metadata: {}", e))?;
    
    let architecture = model.meta_val_str("general.architecture").unwrap_or_else(|_| "unknown".to_string());
    
    let ctx_key = format!("{}.context_length", architecture);
    let context_length = model.meta_val_str(&ctx_key)
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(4096);
        
    let arch_lower = architecture.to_lowercase();
    let has_vision = arch_lower.contains("llava") || arch_lower.contains("vl") || arch_lower.contains("qwen-vl") || arch_lower.contains("vision");
    
    Ok(GgufMetadata {
        architecture,
        context_length,
        has_vision,
    })
}

#[tauri::command]
async fn run_builtin_model(
    path: String,
    filename: String,
    prompt: String,
    temperature: f64,
    top_p: f64,
    max_tokens: usize,
) -> Result<String, String> {
    let mut model_path = PathBuf::from(&path);
    model_path.push(&filename);

    tracing::info!("Initializing llama_cpp backend for {}", filename);
    let backend = LlamaBackend::init().map_err(|e| e.to_string())?;
    let model_params = LlamaModelParams::default();
    
    let model = LlamaModel::load_from_file(&backend, &model_path, &model_params)
        .map_err(|e| format!("Failed to load model. It might be incompatible or corrupted: {}", e))?;

    // Tokenize prompt first to know required context size
    let sanitized_prompt = prompt.replace('\0', "");
    let tokens = model.str_to_token(&sanitized_prompt, AddBos::Always)
        .map_err(|e| format!("Failed to tokenize prompt: {}", e))?;
        
    tracing::info!("Prompt tokenized to {} tokens", tokens.len());

    let req_ctx_size = tokens.len() as u32 + max_tokens as u32 + 1024;
    let n_batch = 2048;

    let ctx_params = LlamaContextParams::default()
        .with_n_ctx(Some(std::num::NonZeroU32::new(req_ctx_size).unwrap_or(std::num::NonZeroU32::new(2048).unwrap())))
        .with_n_batch(n_batch);
    
    let mut ctx = model.new_context(&backend, ctx_params)
        .map_err(|e| format!("Failed to create context: {}", e))?;

    let mut sampler = LlamaSampler::chain_simple([
        if temperature > 0.0 { LlamaSampler::temp(temperature as f32) } else { LlamaSampler::greedy() },
        LlamaSampler::top_p(if top_p > 0.0 && top_p < 1.0 { top_p as f32 } else { 1.0 }, 1),
        LlamaSampler::greedy(),
    ]);

    let mut generated_text = String::new();
    let mut batch = LlamaBatch::new(n_batch as usize, 1);
    
    // Evaluate initial prompt in chunks to respect n_batch limit
    let mut n_cur = 0;
    
    for chunk in tokens.chunks(n_batch as usize) {
        batch.clear();
        for (i, &token) in chunk.iter().enumerate() {
            let is_last = (n_cur + i as i32) == (tokens.len() as i32 - 1);
            batch.add(token, n_cur + i as i32, &[0], is_last).map_err(|e| e.to_string())?;
        }
        ctx.decode(&mut batch).map_err(|e| format!("Decode failed on prompt chunk: {}", e))?;
        n_cur += chunk.len() as i32;
    }

    for _ in 0..max_tokens {
        let new_token = sampler.sample(&ctx, batch.n_tokens() - 1);
        sampler.accept(new_token);
        
        if model.is_eog_token(new_token) {
            break;
        }
        
        // Convert token to string representation
        if let Ok(bytes) = model.token_to_piece_bytes(new_token, 32, true, None) {
            if let Ok(piece) = String::from_utf8(bytes) {
                generated_text.push_str(&piece);
            }
        }
        
        batch.clear();
        batch.add(new_token, n_cur, &[0], true).map_err(|e| e.to_string())?;
        n_cur += 1;
        
        if let Err(e) = ctx.decode(&mut batch) {
            tracing::warn!("Decode failed during generation: {}", e);
            break;
        }
    }

    tracing::info!("Generation complete");
    Ok(generated_text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env().add_directive("tauri_app_lib=info".parse().unwrap()))
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            get_system_memory,
            get_system_vram,
            extract_pdf_text,
            download_model,
            get_downloaded_models,
            delete_model,
            get_all_files_in_dir,
            get_gguf_metadata,
            run_builtin_model
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
