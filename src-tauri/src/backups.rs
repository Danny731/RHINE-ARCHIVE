use rusqlite::{Connection, OptionalExtension};
use std::{fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};

pub fn backup_library(db: &Connection, dir: &Path, reason: &str) -> Result<Option<PathBuf>, String> {
    let raw: Option<String> = db.query_row("SELECT value FROM settings WHERE key='library'", [], |row| row.get(0))
        .optional().map_err(|e| e.to_string())?;
    let Some(raw) = raw else { return Ok(None) };
    // Preserve original bytes, including data a future/older version cannot parse.
    let folder = dir.join("backups");
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let path = folder.join(format!("library-{reason}-{stamp}.json"));
    let mut file = OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| e.to_string())?;
    file.write_all(raw.as_bytes()).and_then(|_| file.sync_all()).map_err(|e| format!("阅读资料备份失败：{e}"))?;
    Ok(Some(path))
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

#[cfg(test)]
mod tests {
    use super::*;
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
