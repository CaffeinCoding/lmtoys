use sysinfo::System;

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
            extract_pdf_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
