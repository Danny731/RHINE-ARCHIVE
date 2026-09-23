use rusqlite::{Connection, OptionalExtension};
use std::{fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};

const AUTO_INTERVAL_MS: u64 = 30 * 60 * 1000;
const AUTO_KEEP: usize = 30;
const MAX_BACKUP_BYTES: u64 = 64 * 1024 * 1024;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub id: String,
    pub created_at: u64,
    pub size: u64,
    pub reason: String,
}

fn folder(dir: &Path) -> Result<PathBuf, String> {
    let path = dir.join("backups");
    if let Ok(meta) = fs::symlink_metadata(&path) {
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return Err("备份目录不可用：请检查目录权限或移除同名文件/链接后重试。".into());
        }
    }
    Ok(path)
}

fn identity(name: &str) -> Option<(&str, u64)> {
    if !name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'.') { return None; }
    let (reason, stamp) = name.strip_prefix("library-")?.strip_suffix(".json")?.rsplit_once('-')?;
    if reason.is_empty() { return None; }
    let millis = stamp.parse::<u128>().ok()? / 1_000_000;
    Some((reason, millis.try_into().ok()?))
}

pub fn list_backups(dir: &Path) -> Result<Vec<BackupEntry>, String> {
    let path = folder(dir)?;
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(format!("无法读取备份列表：{e}")),
    };
    let mut result = vec![];
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let id = entry.file_name().to_string_lossy().into_owned();
        if let Some((reason, created_at)) = identity(&id) {
            let meta = fs::symlink_metadata(entry.path()).map_err(|e| e.to_string())?;
            if meta.is_file() && !meta.file_type().is_symlink() {
                result.push(BackupEntry { reason: reason.into(), created_at, size: meta.len(), id });
            }
        }
    }
    result.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| b.id.cmp(&a.id)));
    Ok(result)
}

pub fn read_backup(dir: &Path, id: &str) -> Result<String, String> {
    if identity(id).is_none() { return Err("无效的备份编号。".into()); }
    let path = folder(dir)?.join(id);
    let meta = fs::symlink_metadata(&path).map_err(|e| format!("无法读取备份：{e}"))?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > MAX_BACKUP_BYTES {
        return Err("备份不是普通文件，或超过 64 MB，未读取。".into());
    }
    fs::read_to_string(path).map_err(|e| format!("无法读取备份：{e}"))
}

fn write_snapshot(dir: &Path, raw: &str, reason: &str) -> Result<PathBuf, String> {
    if !reason.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') || reason.is_empty() {
        return Err("无效的备份类型。".into());
    }
    let folder = folder(dir)?;
    fs::create_dir_all(&folder).map_err(|e| format!("无法创建备份目录：{e}"))?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let path = folder.join(format!("library-{reason}-{stamp}.json"));
    let pending = path.with_extension("pending");
    // Incomplete writes never appear as recoverable snapshots.
    let mut file = OpenOptions::new().write(true).create_new(true).open(&pending)
        .map_err(|e| format!("无法创建备份：{e}"))?;
    let result = file.write_all(raw.as_bytes()).and_then(|_| file.sync_all());
    drop(file);
    if let Err(error) = result.and_then(|_| fs::rename(&pending, &path)) {
        let _ = fs::remove_file(&pending);
        return Err(format!("阅读资料备份失败：{error}"));
    }
    Ok(path)
}

pub fn automatic_backup(dir: &Path, raw: &str, now_ms: u64) -> Result<(), String> {
    let existing = list_backups(dir)?;
    let latest = existing.iter().find(|entry| entry.reason == "auto");
    if latest.is_none_or(|entry| now_ms.saturating_sub(entry.created_at) >= AUTO_INTERVAL_MS) {
        // Empty initial shelves do not consume the first useful recovery point.
        let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
        if latest.is_some() || value["books"].as_array().is_some_and(|books| !books.is_empty()) {
            if latest.is_none_or(|entry| read_backup(dir, &entry.id).ok().as_deref() != Some(raw)) {
                write_snapshot(dir, raw, "auto")?;
            }
        }
    }
    // Only this feature's automatic files rotate; migrations/manual/recovery
    // snapshots and all unknown files are retained.
    for entry in list_backups(dir)?.into_iter().filter(|entry| entry.reason == "auto").skip(AUTO_KEEP) {
        fs::remove_file(folder(dir)?.join(entry.id)).map_err(|e| format!("自动备份清理失败：{e}"))?;
    }
    Ok(())
}

pub fn replace_library(db: &Connection, dir: &Path, json: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(json).map_err(|_| "备份 JSON 已损坏。")?;
    if value["version"] != 1 || !value["books"].is_array() || !value["dark"].is_boolean() {
        return Err("不支持的备份格式或版本。".into());
    }
    backup_library(db, dir, "before-restore")?;
    db.execute("INSERT INTO settings(key,value) VALUES('library',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [json])
        .map_err(|e| format!("恢复写入失败，原书库未替换：{e}"))?;
    Ok(())
}

pub fn export_text(path: &Path, content: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("导出位置无效。")?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let pending = parent.join(format!(".rhine-export-{stamp}.pending"));
    let mut file = OpenOptions::new().write(true).create_new(true).open(&pending).map_err(|e| e.to_string())?;
    let result = file.write_all(content.as_bytes()).and_then(|_| file.sync_all());
    drop(file);
    if let Err(error) = result.and_then(|_| fs::rename(&pending, path)) {
        let _ = fs::remove_file(pending);
        return Err(format!("导出失败，目标文件未替换：{error}"));
    }
    Ok(())
}

pub fn backup_library(db: &Connection, dir: &Path, reason: &str) -> Result<Option<PathBuf>, String> {
    let raw: Option<String> = db.query_row("SELECT value FROM settings WHERE key='library'", [], |row| row.get(0))
        .optional().map_err(|e| e.to_string())?;
    let Some(raw) = raw else { return Ok(None) };
    // Preserve original bytes, including data a future/older version cannot parse.
    Ok(Some(write_snapshot(dir, &raw, reason)?))
}

pub fn backup_on_version_change(db: &Connection, dir: &Path, version: &str) -> Result<(), String> {
    let previous: Option<String> = db.query_row("SELECT value FROM settings WHERE key='last_app_version'", [], |row| row.get(0))
        .optional().map_err(|e| e.to_string())?;
    if previous.as_deref() != Some(version) {
        backup_library(db, dir, "before-version-change")?;
        db.execute("INSERT INTO settings(key,value) VALUES('last_app_version',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [version])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn backup_before_shelf_changes(db: &Connection, dir: &Path) -> Result<(), String> {
    let done: Option<String> = db.query_row("SELECT value FROM settings WHERE key='shelf_v1_backup'", [], |row| row.get(0))
        .optional().map_err(|e| e.to_string())?;
    if done.is_none() {
        backup_library(db, dir, "before-shelf-v1")?;
        db.execute("INSERT INTO settings(key,value) VALUES('shelf_v1_backup','1')", []).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn backup_before_workspace_changes(db: &Connection, dir: &Path) -> Result<(), String> {
    let done: Option<String> = db.query_row("SELECT value FROM settings WHERE key='workspace_v1_backup'", [], |row| row.get(0))
        .optional().map_err(|e| e.to_string())?;
    if done.is_none() {
        backup_library(db, dir, "before-workspace-v1")?;
        db.execute("INSERT INTO settings(key,value) VALUES('workspace_v1_backup','1')", []).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn backup_before_ink_changes(db: &Connection, dir: &Path) -> Result<(), String> {
    let done: Option<String> = db.query_row("SELECT value FROM settings WHERE key='ink_v1_backup'", [], |row| row.get(0))
        .optional().map_err(|e| e.to_string())?;
    if done.is_none() {
        backup_library(db, dir, "before-ink-v1")?;
        db.execute("INSERT INTO settings(key,value) VALUES('ink_v1_backup','1')", []).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn backup_before_cover_changes(db: &Connection, dir: &Path) -> Result<(), String> {
    let done: Option<String> = db.query_row("SELECT value FROM settings WHERE key='cover_v1_backup'", [], |row| row.get(0))
        .optional().map_err(|e| e.to_string())?;
    if done.is_none() {
        backup_library(db, dir, "before-cover-v1")?;
        db.execute("INSERT INTO settings(key,value) VALUES('cover_v1_backup','1')", []).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn test_dir(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!("rhine-{label}-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()))
    }
    #[test]
    fn cover_extension_backs_up_original_once_and_failed_backup_blocks_marker() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO settings VALUES('library','original cover-free library');").unwrap();
        let dir = test_dir("cover");
        fs::write(&dir, "blocker").unwrap();
        assert!(backup_before_cover_changes(&db, &dir).is_err());
        assert_eq!(db.query_row("SELECT count(*) FROM settings WHERE key='cover_v1_backup'", [], |row| row.get::<_, i32>(0)).unwrap(), 0);
        fs::remove_file(&dir).unwrap();
        backup_before_cover_changes(&db, &dir).unwrap();
        backup_before_cover_changes(&db, &dir).unwrap();
        let entries = list_backups(&dir).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(read_backup(&dir, &entries[0].id).unwrap(), "original cover-free library");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn rotation_only_removes_old_automatic_snapshots() {
        let dir = test_dir("rotation");
        fs::create_dir_all(dir.join("backups")).unwrap();
        let raw = r#"{"version":1,"books":[],"dark":false}"#;
        for index in 1..=35 {
            fs::write(dir.join("backups").join(format!("library-auto-{}.json", index * 1_000_000u64)), raw).unwrap();
        }
        let protected = dir.join("backups/library-before-restore-1000000.json");
        fs::write(&protected, "original invalid data").unwrap();
        let unknown = dir.join("backups/personal.json");
        fs::write(&unknown, "leave me alone").unwrap();
        automatic_backup(&dir, raw, 40).unwrap();
        let entries = list_backups(&dir).unwrap();
        assert_eq!(entries.iter().filter(|entry| entry.reason == "auto").count(), 30);
        assert!(!dir.join("backups/library-auto-1000000.json").exists());
        assert_eq!(fs::read_to_string(protected).unwrap(), "original invalid data");
        assert!(unknown.exists());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn snapshots_are_complete_and_repeated_unchanged_saves_do_not_fill_history() {
        let dir = test_dir("snapshot");
        let raw = r#"{"version":1,"books":[{"id":"keep"}],"dark":false}"#;
        automatic_backup(&dir, raw, u64::MAX).unwrap();
        automatic_backup(&dir, raw, u64::MAX).unwrap();
        let entries = list_backups(&dir).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(read_backup(&dir, &entries[0].id).unwrap(), raw);
        assert_eq!(fs::read_dir(dir.join("backups")).unwrap().count(), 1);
        assert!(read_backup(&dir, "../pagewise.sqlite").is_err());
        assert!(read_backup(&dir, "library-auto-1.json/../../private.json").is_err());
        fs::write(dir.join("backups/library-auto-2000000.pending"), "partial").unwrap();
        assert_eq!(list_backups(&dir).unwrap().len(), 1);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn restore_preserves_unreadable_original_and_failure_never_replaces_it() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO settings VALUES('library','damaged original');").unwrap();
        let dir = test_dir("restore");
        let valid = r#"{"version":1,"books":[],"dark":false}"#;
        assert!(replace_library(&db, &dir, "{}").is_err());
        fs::write(&dir, "blocker").unwrap();
        assert!(replace_library(&db, &dir, valid).is_err());
        assert_eq!(db.query_row("SELECT value FROM settings WHERE key='library'", [], |r| r.get::<_,String>(0)).unwrap(), "damaged original");
        fs::remove_file(&dir).unwrap();
        replace_library(&db, &dir, valid).unwrap();
        assert_eq!(read_backup(&dir, &list_backups(&dir).unwrap()[0].id).unwrap(), "damaged original");
        assert_eq!(db.query_row("SELECT value FROM settings WHERE key='library'", [], |r| r.get::<_,String>(0)).unwrap(), valid);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn export_replaces_only_after_complete_write_and_cleans_failed_temporary_file() {
        let dir = test_dir("export");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("backup.json");
        fs::write(&path, "old backup").unwrap();
        export_text(&path, "complete new backup").unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "complete new backup");
        let blocker = dir.join("existing-directory.json");
        fs::create_dir(&blocker).unwrap();
        fs::write(blocker.join("keep.txt"), "keep").unwrap();
        assert!(export_text(&blocker, "new data").is_err());
        assert_eq!(fs::read_to_string(blocker.join("keep.txt")).unwrap(), "keep");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn ink_extension_preserves_legacy_bytes_once_and_backup_failure_blocks_marker() {
        let db = Connection::open_in_memory().unwrap();
        let original = r#"{"version":1,"books":[{"id":"old","marks":[]}],"dark":false}"#;
        db.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)").unwrap();
        db.execute("INSERT INTO settings VALUES('library',?1)", [original]).unwrap();
        let dir = std::env::temp_dir().join(format!("pagewise-ink-test-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::write(&dir, b"blocker").unwrap();
        assert!(backup_before_ink_changes(&db, &dir).is_err());
        assert_eq!(db.query_row("SELECT count(*) FROM settings WHERE key='ink_v1_backup'", [], |r| r.get::<_,i32>(0)).unwrap(), 0);
        fs::remove_file(&dir).unwrap();
        backup_before_ink_changes(&db, &dir).unwrap();
        db.execute("UPDATE settings SET value='changed' WHERE key='library'", []).unwrap();
        backup_before_ink_changes(&db, &dir).unwrap();
        let files: Vec<_> = fs::read_dir(dir.join("backups")).unwrap().map(|f| f.unwrap().path()).collect();
        assert_eq!(files.len(), 1);
        assert_eq!(fs::read_to_string(&files[0]).unwrap(), original);
        fs::remove_file(&files[0]).unwrap();
        fs::remove_dir(dir.join("backups")).unwrap();
        fs::remove_dir(&dir).unwrap();
    }
    #[test]
    fn workspace_backup_preserves_old_library_and_failure_leaves_marker_unset() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO settings VALUES('library','original workspace-free library');").unwrap();
        let root = std::env::temp_dir().join(format!("pagewise-workspace-test-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::write(&root, b"blocker").unwrap();
        assert!(backup_before_workspace_changes(&db, &root).is_err());
        let count: i32 = db.query_row("SELECT count(*) FROM settings WHERE key='workspace_v1_backup'", [], |row| row.get(0)).unwrap();
        assert_eq!(count, 0);
        fs::remove_file(&root).unwrap();
        backup_before_workspace_changes(&db, &root).unwrap();
        backup_before_workspace_changes(&db, &root).unwrap();
        let files: Vec<_> = fs::read_dir(root.join("backups")).unwrap().collect();
        assert_eq!(files.len(), 1);
        assert_eq!(fs::read_to_string(files[0].as_ref().unwrap().path()).unwrap(), "original workspace-free library");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn shelf_backup_precedes_extension_even_without_app_version_bump() {
        let db = Connection::open_in_memory().unwrap();
        let original = r#"{"version":1,"books":[],"dark":false}"#;
        db.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)").unwrap();
        db.execute("INSERT INTO settings VALUES('library',?1)", [original]).unwrap();
        let dir = std::env::temp_dir().join(format!("pagewise-shelf-test-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        backup_before_shelf_changes(&db, &dir).unwrap();
        db.execute("UPDATE settings SET value='modified' WHERE key='library'", []).unwrap();
        backup_before_shelf_changes(&db, &dir).unwrap();
        let files: Vec<_> = fs::read_dir(dir.join("backups")).unwrap().collect();
        assert_eq!(files.len(), 1);
        assert_eq!(fs::read_to_string(files[0].as_ref().unwrap().path()).unwrap(), original);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn preserves_legacy_bytes_once_per_version_and_before_install() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)").unwrap();
        let raw = "{\"version\":1,\"books\":[],\"dark\":false,\"futureField\":42}";
        db.execute("INSERT INTO settings VALUES('library',?1)", [raw]).unwrap();
        let dir = std::env::temp_dir().join(format!("pagewise-backup-test-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        backup_on_version_change(&db, &dir, "0.2.2").unwrap();
        backup_on_version_change(&db, &dir, "0.2.2").unwrap();
        assert_eq!(fs::read_dir(dir.join("backups")).unwrap().count(), 1);
        backup_on_version_change(&db, &dir, "0.3.0").unwrap();
        let install_backup = backup_library(&db, &dir, "before-update").unwrap().unwrap();
        assert_eq!(fs::read_to_string(install_backup).unwrap(), raw);
        assert_eq!(fs::read_dir(dir.join("backups")).unwrap().count(), 3);
        assert_eq!(db.query_row("SELECT value FROM settings WHERE key='library'", [], |row| row.get::<_,String>(0)).unwrap(), raw);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn backup_failure_does_not_mark_version_as_migrated() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO settings VALUES('library','unreadable original data');").unwrap();
        let path = std::env::temp_dir().join(format!("pagewise-backup-blocker-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::write(&path, b"blocker").unwrap();
        assert!(backup_on_version_change(&db, &path, "0.3.0").is_err());
        let count:i32 = db.query_row("SELECT count(*) FROM settings WHERE key='last_app_version'", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 0);
        fs::remove_file(path).unwrap();
    }
}
