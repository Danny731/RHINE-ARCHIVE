use serde::Serialize;
use std::{sync::{Mutex, atomic::{AtomicBool, Ordering}}, time::Duration};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};
use crate::{Store, backups::backup_library};

#[derive(Default)]
struct Pending { update: Option<Update>, bytes: Option<Vec<u8>> }
#[derive(Default)]
pub struct Updates { pending: Mutex<Pending>, busy: AtomicBool }
struct Operation<'a>(&'a AtomicBool);
impl Drop for Operation<'_> { fn drop(&mut self) { self.0.store(false, Ordering::SeqCst); } }
impl Updates {
    fn begin(&self) -> Result<Operation<'_>, String> {
        self.busy.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).map_err(|_| "已有更新操作正在进行".to_string())?;
        Ok(Operation(&self.busy))
    }
}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct UpdateInfo { version: String, current_version: String, notes: String }

#[tauri::command]
pub fn update_preferences(store: tauri::State<Store>) -> Result<bool, String> {
    use rusqlite::OptionalExtension;
    let db=store.0.lock().map_err(|e|e.to_string())?;
    let value:Option<String>=db.query_row("SELECT value FROM settings WHERE key='auto_updates'",[],|row|row.get(0)).optional().map_err(|e|e.to_string())?;
    Ok(value.as_deref()!=Some("false"))
}
#[tauri::command]
pub fn set_auto_updates(enabled: bool, store: tauri::State<Store>) -> Result<(), String> {
    store.0.lock().map_err(|e|e.to_string())?.execute("INSERT INTO settings(key,value) VALUES('auto_updates',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[if enabled {"true"} else {"false"}]).map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle, state: tauri::State<'_, Updates>) -> Result<Option<UpdateInfo>, String> {
    if cfg!(target_os = "macos") { return Err("Mac 版请手动替换应用升级。".into()); }
    let _operation=state.begin()?;
    *state.pending.lock().map_err(|e|e.to_string())?=Pending::default();
    let found=app.updater_builder().timeout(Duration::from_secs(20)).build().map_err(|e|e.to_string())?
        .check().await.map_err(|_| "暂时无法访问更新源。请检查网络；仓库尚未公开或更新清单尚未发布时也会出现此提示。当前程序可继续使用。".to_string())?;
    if let Some(mut update)=found {
        if update.download_url.scheme() != "https" { return Err("更新包地址必须使用 HTTPS，已拒绝此更新。".into()); }
        update.timeout=Some(Duration::from_secs(300));
        let info=UpdateInfo { version:update.version.clone(),current_version:update.current_version.clone(),notes:update.body.clone().unwrap_or_default() };
        state.pending.lock().map_err(|e|e.to_string())?.update=Some(update);
        Ok(Some(info))
    } else { Ok(None) }
}
#[tauri::command]
pub async fn download_update(app: tauri::AppHandle, state: tauri::State<'_, Updates>) -> Result<(), String> {
    if cfg!(target_os = "macos") { return Err("Mac 版请手动替换应用升级。".into()); }
    let _operation=state.begin()?;
    let update=state.pending.lock().map_err(|e|e.to_string())?.update.clone().ok_or("请先检查更新")?;
    let mut received=0u64;
    let result=update.download(|chunk,total| {
        received+=chunk as u64;
        let _=app.emit("update-progress",serde_json::json!({"phase":"downloading","received":received,"total":total}));
    },|| {let _=app.emit("update-progress",serde_json::json!({"phase":"verifying"}));}).await;
    let bytes=result.map_err(|_| "更新包下载或签名校验失败，未安装任何内容。请检查网络后重试。".to_string())?;
    state.pending.lock().map_err(|e|e.to_string())?.bytes=Some(bytes);
    Ok(())
}
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle, state: tauri::State<'_, Updates>, store: tauri::State<'_, Store>) -> Result<(), String> {
    if cfg!(target_os = "macos") { return Err("Mac 版请手动替换应用升级。".into()); }
    let _operation=state.begin()?;
    let (update,bytes)={
        let mut pending=state.pending.lock().map_err(|e|e.to_string())?;
        let update=pending.update.clone().ok_or("请先检查更新")?;
        if pending.bytes.is_none() {return Err("请先下载并验证更新包".into());}
        // Back up the saved database before installer launch can terminate us.
        let db=store.0.lock().map_err(|e|e.to_string())?;
        let dir=app.path().app_data_dir().map_err(|e|e.to_string())?;
        backup_library(&db,&dir,"before-update")?;
        (update,pending.bytes.take().unwrap())
    };
    // Windows updater invokes the NSIS installer and exits after launch.
    tauri::async_runtime::spawn_blocking(move || update.install(bytes)).await.map_err(|e|e.to_string())?
        .map_err(|e|format!("无法启动安装程序，请重新下载后重试：{e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn operations_are_serialized_and_unlock_after_failure() {
        let updates=Updates::default();
        let guard=updates.begin().unwrap();
        assert!(updates.begin().is_err());
        drop(guard);
        assert!(updates.begin().is_ok());
        assert!(updates.pending.lock().unwrap().bytes.is_none());
    }
    #[test]
    #[ignore = "Run after npm run package to verify actual installer artifacts"]
    fn signed_package_matches_client_key_and_rejects_tampering() {
        use base64::Engine;
        use minisign_verify::{PublicKey, Signature};
        let root=std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let config:serde_json::Value=serde_json::from_str(&std::fs::read_to_string(root.join("tauri.conf.json")).unwrap()).unwrap();
        assert_eq!(config["identifier"], "com.pagewise.reader");
        let folder=root.join("target/release/bundle/nsis");
        let manifest:serde_json::Value=serde_json::from_str(&std::fs::read_to_string(folder.join("latest.json")).unwrap()).unwrap();
        assert_eq!(manifest["version"],env!("CARGO_PKG_VERSION"));
        let asset=&manifest["platforms"]["windows-x86_64"];
        let name=format!("RHINE ARCHIVE_{}_x64-setup.exe",env!("CARGO_PKG_VERSION"));
        assert_eq!(asset["url"],format!("https://github.com/Danny731/RHINE-ARCHIVE/releases/download/v{}/{}",env!("CARGO_PKG_VERSION"),name.replace(' ', "%20")));
        let signature=std::fs::read_to_string(folder.join(format!("{name}.sig"))).unwrap();
        assert_eq!(asset["signature"],signature.trim());
        let decode=|value:&str| String::from_utf8(base64::engine::general_purpose::STANDARD.decode(value.trim()).unwrap()).unwrap();
        let key=PublicKey::decode(&decode(config["plugins"]["updater"]["pubkey"].as_str().unwrap())).unwrap();
        let signature=Signature::decode(&decode(&signature)).unwrap();
        let mut bytes=std::fs::read(folder.join(name)).unwrap();
        key.verify(&bytes,&signature,true).unwrap();
        bytes[0]^=1;
        assert!(key.verify(&bytes,&signature,true).is_err());
    }
}
