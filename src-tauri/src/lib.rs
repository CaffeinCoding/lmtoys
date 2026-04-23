use sysinfo::System;
use std::path::PathBuf;
use tauri::Emitter;
use futures_util::StreamExt;
use std::fs::File;
use std::io::Write;
use candle_core::{Device, Tensor};
use candle_transformers::generation::LogitsProcessor;
use tokenizers::Tokenizer;

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
    // 연관된 토크나이저 파일도 함께 삭제
    let mut tokenizer_path = PathBuf::from(&path);
    tokenizer_path.push(format!("{}.tokenizer.json", filename));
    if tokenizer_path.exists() {
        std::fs::remove_file(tokenizer_path).map_err(|e| e.to_string())?;
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
    
    let mut file = File::open(&dest_path).map_err(|e| e.to_string())?;
    
    // Candle's GGUF parser
    let content = candle_core::quantized::gguf_file::Content::read(&mut file).map_err(|e| e.to_string())?;
    
    let mut architecture = String::from("unknown");
    let mut context_length = 4096;
    let mut has_vision = false;
    
    if let Some(arch) = content.metadata.get("general.architecture") {
        if let candle_core::quantized::gguf_file::Value::String(s) = arch {
            architecture = s.clone();
            
            let ctx_key = format!("{}.context_length", architecture);
            if let Some(ctx) = content.metadata.get(&ctx_key) {
                match ctx {
                    candle_core::quantized::gguf_file::Value::U32(v) => context_length = *v as u64,
                    candle_core::quantized::gguf_file::Value::U64(v) => context_length = *v,
                    _ => {}
                }
            }
        }
    }
    
    let arch_lower = architecture.to_lowercase();
    if arch_lower.contains("llava") || arch_lower.contains("vl") || arch_lower.contains("qwen-vl") {
        has_vision = true;
    }
    
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
    
    let mut tokenizer_path = PathBuf::from(&path);
    tokenizer_path.push(format!("{}.tokenizer.json", filename));

    if !tokenizer_path.exists() {
        return Err("Tokenizer not found. Please visit Settings, delete the model, and re-download it to fetch the tokenizer.".into());
    }

    let tokenizer = Tokenizer::from_file(&tokenizer_path).map_err(|e| e.to_string())?;

    let mut file = std::fs::File::open(&model_path).map_err(|e| e.to_string())?;
    let content = candle_core::quantized::gguf_file::Content::read(&mut file).map_err(|e| {
        if e.to_string().contains("unknown dtype") {
            format!("Unsupported GGUF tensor type found. This model might be using imatrix (IQ) or UD quantization which is not yet supported by Candle. Please try a standard Q4_K_M or Q8_0 model from a different provider (e.g., bartowski). Original error: {}", e)
        } else {
            e.to_string()
        }
    })?;

    // Detect architecture from GGUF metadata
    let architecture = content.metadata.get("general.architecture")
        .and_then(|v| {
            if let candle_core::quantized::gguf_file::Value::String(s) = v { Some(s.clone()) } else { None }
        })
        .unwrap_or_else(|| "llama".to_string())
        .to_lowercase();

    let seed = 299792458;
    let temp = if temperature <= 0.0 { None } else { Some(temperature) };
    let top_p_opt = if top_p <= 0.0 || top_p >= 1.0 { None } else { Some(top_p) };
    let mut logits_processor = LogitsProcessor::new(seed, temp, top_p_opt);

    let tokens = tokenizer.encode(prompt, true).map_err(|e| e.to_string())?;
    let mut tokens = tokens.get_ids().to_vec();

    // Multi-architecture enum dispatch
    enum ModelArch {
        Llama(candle_transformers::models::quantized_llama::ModelWeights),
        Phi(candle_transformers::models::quantized_phi::ModelWeights),
        Phi3(candle_transformers::models::quantized_phi3::ModelWeights),
        Qwen2(candle_transformers::models::quantized_qwen2::ModelWeights),
    }

    let supported_archs = ["llama", "gemma", "gemma2", "gemma3", "gemma4", "phi", "phi2", "phi3", "qwen", "qwen2", "qwen2moe", "starcoder2", "internlm2"];

    let mut model = match architecture.as_str() {
        // Llama family: llama, gemma, gemma2, gemma3, gemma4, internlm2, starcoder2 all use the quantized_llama loader
        "llama" | "gemma" | "gemma2" | "gemma3" | "gemma4" | "internlm2" | "starcoder2" => {
            let m = candle_transformers::models::quantized_llama::ModelWeights::from_gguf(content, &mut file, &Device::Cpu)
                .map_err(|e| format!("Failed to load model as Llama-compatible (arch: {}): {}", architecture, e))?;
            ModelArch::Llama(m)
        },
        // Phi-2 family
        "phi" | "phi2" => {
            let m = candle_transformers::models::quantized_phi::ModelWeights::from_gguf(content, &mut file, &Device::Cpu)
                .map_err(|e| format!("Failed to load model as Phi (arch: {}): {}", architecture, e))?;
            ModelArch::Phi(m)
        },
        // Phi-3 family
        "phi3" => {
            let m = candle_transformers::models::quantized_phi3::ModelWeights::from_gguf(false, content, &mut file, &Device::Cpu)
                .map_err(|e| format!("Failed to load model as Phi3 (arch: {}): {}", architecture, e))?;
            ModelArch::Phi3(m)
        },
        // Qwen2 family
        "qwen" | "qwen2" | "qwen2moe" => {
            let m = candle_transformers::models::quantized_qwen2::ModelWeights::from_gguf(content, &mut file, &Device::Cpu)
                .map_err(|e| format!("Failed to load model as Qwen2 (arch: {}): {}", architecture, e))?;
            ModelArch::Qwen2(m)
        },
        _ => {
            return Err(format!(
                "Unsupported model architecture: '{}'. Supported architectures: {:?}. \
                You can still use this model via Ollama or LM Studio.",
                architecture, supported_archs
            ));
        }
    };

    let mut generated_text = String::new();

    // Unified inference loop — all architectures share the same forward(input, pos) -> logits signature
    for index in 0..max_tokens {
        let context_size = if index > 0 { 1 } else { tokens.len() };
        let start_pos = tokens.len().saturating_sub(context_size);
        
        let input = Tensor::new(&tokens[start_pos..], &Device::Cpu)
            .map_err(|e| e.to_string())?
            .unsqueeze(0)
            .map_err(|e| e.to_string())?;
        
        let logits = match &mut model {
            ModelArch::Llama(m) => m.forward(&input, start_pos),
            ModelArch::Phi(m) => m.forward(&input, start_pos),
            ModelArch::Phi3(m) => m.forward(&input, start_pos),
            ModelArch::Qwen2(m) => m.forward(&input, start_pos),
        }.map_err(|e| e.to_string())?;

        let logits = logits.squeeze(0).map_err(|e| e.to_string())?;
        let logits = logits.squeeze(0).map_err(|e| e.to_string())?;
        
        let next_token = logits_processor.sample(&logits).map_err(|e| e.to_string())?;
        tokens.push(next_token);
        
        if let Some(text) = tokenizer.decode(&[next_token], false).ok() {
            generated_text.push_str(&text);
        }
    }

    Ok(generated_text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
