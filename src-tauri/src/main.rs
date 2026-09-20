#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rusqlite::{Connection, OptionalExtension};
use std::{path::PathBuf, sync::Mutex};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
mod backups;
mod updates;
mod pdf_export;
mod open_files;
#[cfg(target_os = "macos")]
mod mac_menu;

struct Store(Mutex<Connection>);

#[tauri::command]
fn load_library(store: tauri::State<Store>) -> Result<Option<String>, String> {
    store.0.lock().map_err(|e| e.to_string())?
        .query_row("SELECT value FROM settings WHERE key='library'", [], |row| row.get(0))
        .optional().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_library(json: String, app: tauri::AppHandle, store: tauri::State<Store>) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    if value["version"] != 1 || !value["books"].is_array() { return Err("Invalid library data".into()); }
    let db = store.0.lock().map_err(|e| e.to_string())?;
    if value["books"].as_array().unwrap().iter().any(|b| b.get("inkStrokes").is_some()) {
        backups::backup_before_ink_changes(&db, &app.path().app_data_dir().map_err(|e| e.to_string())?)?;
    }
    if value.get("workspace").is_some() {
        backups::backup_before_workspace_changes(&db, &app.path().app_data_dir().map_err(|e| e.to_string())?)?;
    }
    if value.get("collections").is_some() || value["books"].as_array().unwrap().iter().any(|b| b.get("removedAt").is_some()) {
        backups::backup_before_shelf_changes(&db, &app.path().app_data_dir().map_err(|e| e.to_string())?)?;
    }
    db.execute("INSERT INTO settings(key,value) VALUES('library',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [&json])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn pick_pdf(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().set_title("打开教材 PDF").add_filter("PDF", &["pdf"])
            .blocking_pick_file().map(|p| p.into_path().map(|p| p.to_string_lossy().to_string()).map_err(|e| e.to_string())).transpose()
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn read_pdf(path: String) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(path);
        if !path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("pdf")) { return Err("请选择 PDF 文件".into()); }
        let meta = std::fs::metadata(&path).map_err(|_| "找不到文件，可能已移动或改名。请重新打开该 PDF。".to_string())?;
        if !meta.is_file() || meta.len() > 512 * 1024 * 1024 { return Err("当前版本支持 512 MB 以内的 PDF".into()); }
        let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
        if !bytes.iter().take(1024).copied().collect::<Vec<_>>().windows(5).any(|x| x == b"%PDF-") { return Err("文件内容不是有效的 PDF".into()); }
        Ok(tauri::ipc::Response::new(bytes))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn finish_quit(app: tauri::AppHandle) { app.exit(0); }

#[tauri::command]
async fn export_text(app: tauri::AppHandle, content: String, name: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ext = if name.ends_with(".json") { "json" } else { "md" };
        let picked = app.dialog().file().set_title("导出阅读资料").set_file_name(&name).add_filter("阅读资料", &[ext]).blocking_save_file();
        if let Some(file) = picked {
            let path = file.into_path().map_err(|e| e.to_string())?;
            std::fs::write(path, content).map_err(|e| e.to_string())?;
            Ok(true)
        } else { Ok(false) }
    }).await.map_err(|e| e.to_string())?
}

fn main() {
    let pending = open_files::OpenFiles::default();
    for path in std::env::args().skip(1) { pending.push(path); }
    tauri::Builder::default()
        .manage(pending)
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            open_files::queue(app, args.into_iter().skip(1));
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updates::Updates::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            mac_menu::install(app)?;
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = Connection::open(dir.join("pagewise.sqlite"))?;
            db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);")?;
            backups::backup_on_version_change(&db, &dir, env!("CARGO_PKG_VERSION"))
                .map_err(std::io::Error::other)?;
            app.manage(Store(Mutex::new(db)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_library, save_library, pick_pdf, read_pdf, finish_quit, open_files::take_pending_pdf, export_text, pdf_export::export_pdf,
            updates::update_preferences, updates::set_auto_updates, updates::check_for_update, updates::download_update, updates::install_update])
        .build(tauri::generate_context!())
        .expect("Rhine Archive could not start")
        .run(|_app, event| {
            match event {
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Opened { urls } => {
                    open_files::queue(_app, urls.into_iter().filter_map(|url|
                        url.to_file_path().ok().map(|p| p.to_string_lossy().into_owned())));
                }
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen { .. } => open_files::show_main(_app),
                _ => {}
            }
        });
}
