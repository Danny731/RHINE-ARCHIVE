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
#[cfg(target_os = "macos")]
mod mac_window;
#[cfg(any(target_os = "macos", test))]
mod window_close;

struct Store(Mutex<Connection>, Mutex<Option<String>>);
impl Store {
    fn open(dir: &std::path::Path) -> Result<Self, rusqlite::Error> {
        let opened = (|| -> Result<Connection, String> {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            let db = Connection::open(dir.join("pagewise.sqlite")).map_err(|e| e.to_string())?;
            db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);").map_err(|e| e.to_string())?;
            Ok(db)
        })();
        match opened {
            Ok(db) => Ok(Self(Mutex::new(db), Mutex::new(None))),
            // The UI remains available; all DB commands reject this placeholder.
            Err(error) => Ok(Self(Mutex::new(Connection::open_in_memory()?), Mutex::new(Some(format!("书库数据库无法打开，原文件保留不动：{error}"))))),
        }
    }
    fn reconnect(&self, dir: &std::path::Path) -> Result<(), String> {
        let mut failure = self.1.lock().map_err(|e| e.to_string())?;
        if failure.is_none() { return Ok(()); }
        let opened = Self::open(dir).map_err(|e| e.to_string())?;
        if let Some(error) = opened.1.into_inner().map_err(|e| e.to_string())? { return Err(error); }
        *self.0.lock().map_err(|e| e.to_string())? = opened.0.into_inner().map_err(|e| e.to_string())?;
        *failure = None;
        Ok(())
    }
    fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        if let Some(error) = &*self.1.lock().map_err(|e| e.to_string())? { return Err(error.clone()); }
        self.0.lock().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn load_library(app: tauri::AppHandle, store: tauri::State<Store>) -> Result<Option<String>, String> {
    store.reconnect(&app.path().app_data_dir().map_err(|e| e.to_string())?)?;
    let db = store.connection()?;
    // A failed protection backup is reported in the UI instead of aborting startup.
    backups::backup_on_version_change(&db, &app.path().app_data_dir().map_err(|e| e.to_string())?, env!("CARGO_PKG_VERSION"))?;
    db
        .query_row("SELECT value FROM settings WHERE key='library'", [], |row| row.get(0))
        .optional().map_err(|e| e.to_string())
}

#[tauri::command]
fn read_library_raw(store: tauri::State<Store>) -> Result<Option<String>, String> {
    store.connection()?
        .query_row("SELECT value FROM settings WHERE key='library'", [], |row| row.get(0))
        .optional().map_err(|e| e.to_string())
}

#[tauri::command]
fn list_library_backups(app: tauri::AppHandle) -> Result<Vec<backups::BackupEntry>, String> {
    backups::list_backups(&app.path().app_data_dir().map_err(|e| e.to_string())?)
}

#[tauri::command]
fn read_library_backup(app: tauri::AppHandle, id: String) -> Result<String, String> {
    backups::read_backup(&app.path().app_data_dir().map_err(|e| e.to_string())?, &id)
}

#[tauri::command]
fn create_library_backup(app: tauri::AppHandle, store: tauri::State<Store>) -> Result<(), String> {
    let db = store.connection()?;
    if backups::backup_library(&db, &app.path().app_data_dir().map_err(|e| e.to_string())?, "manual")?.is_none() {
        return Err("暂无已保存的书库可备份。".into());
    }
    Ok(())
}

#[tauri::command]
fn restore_library(app: tauri::AppHandle, store: tauri::State<Store>, json: String) -> Result<(), String> {
    let db = store.connection()?;
    backups::replace_library(&db, &app.path().app_data_dir().map_err(|e| e.to_string())?, &json)
}

#[tauri::command]
fn save_library(json: String, app: tauri::AppHandle, store: tauri::State<Store>) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    if value["version"] != 1 || !value["books"].is_array() { return Err("Invalid library data".into()); }
    let db = store.connection()?;
    if value["books"].as_array().unwrap().iter().any(|b| b.get("coverPage").is_some()) {
        backups::backup_before_cover_changes(&db, &app.path().app_data_dir().map_err(|e| e.to_string())?)?;
    }
    if value["books"].as_array().unwrap().iter().any(|b| b.get("inkStrokes").is_some()) {
        backups::backup_before_ink_changes(&db, &app.path().app_data_dir().map_err(|e| e.to_string())?)?;
    }
    if value.get("workspace").is_some() {
        backups::backup_before_workspace_changes(&db, &app.path().app_data_dir().map_err(|e| e.to_string())?)?;
    }
    if value.get("collections").is_some() || value["books"].as_array().unwrap().iter().any(|b| b.get("removedAt").is_some()) {
        backups::backup_before_shelf_changes(&db, &app.path().app_data_dir().map_err(|e| e.to_string())?)?;
    }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis() as u64;
    backups::automatic_backup(&app.path().app_data_dir().map_err(|e| e.to_string())?, &json, now)?;
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
async fn hide_reader_window(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { mac_window::hide_after_fullscreen(app).await }
    #[cfg(not(target_os = "macos"))]
    { app.get_webview_window("main").ok_or("阅读窗口不存在。")?.hide().map_err(|e| e.to_string()) }
}

#[tauri::command]
async fn export_text(app: tauri::AppHandle, content: String, name: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ext = if name.ends_with(".json") { "json" } else { "md" };
        let picked = app.dialog().file().set_title("导出阅读资料").set_file_name(&name).add_filter("阅读资料", &[ext]).blocking_save_file();
        if let Some(file) = picked {
            let path = file.into_path().map_err(|e| e.to_string())?;
            if !path.extension().is_some_and(|value| value.eq_ignore_ascii_case(ext)) {
                return Err(format!("请选择 .{ext} 文件名，未写入其他类型文件。"));
            }
            backups::export_text(&path, &content)?;
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
            #[cfg(target_os = "macos")]
            mac_window::install(app)?;
            let dir = app.path().app_data_dir()?;
            app.manage(Store::open(&dir)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_library, save_library, read_library_raw, list_library_backups, read_library_backup, create_library_backup, restore_library, pick_pdf, read_pdf, finish_quit, hide_reader_window, open_files::take_pending_pdf, export_text, pdf_export::export_pdf,
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
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Exit => mac_window::shutdown(_app),
                _ => {}
            }
        });
}

#[cfg(test)]
mod store_tests {
    use super::*;
    #[test]
    fn unreadable_database_keeps_original_bytes_and_rejects_placeholder_access() {
        let dir = std::env::temp_dir().join(format!("rhine-broken-db-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&dir).unwrap();
        let original = b"damaged database: preserve these original bytes";
        std::fs::write(dir.join("pagewise.sqlite"), original).unwrap();
        let store = Store::open(&dir).unwrap();
        assert!(store.connection().is_err());
        assert_eq!(std::fs::read(dir.join("pagewise.sqlite")).unwrap(), original);
        drop(store);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn storage_can_reconnect_after_a_directory_access_problem_is_fixed() {
        let dir = std::env::temp_dir().join(format!("rhine-retry-db-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::write(&dir, "blocked directory").unwrap();
        let store = Store::open(&dir).unwrap();
        assert!(store.connection().is_err());
        assert!(store.reconnect(&dir).is_err());
        std::fs::remove_file(&dir).unwrap();
        store.reconnect(&dir).unwrap();
        assert!(store.connection().is_ok());
        drop(store);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
