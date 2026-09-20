use std::{fs::OpenOptions, io::Write, path::Path};
use tauri_plugin_dialog::DialogExt;

fn write_copy(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if !path.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf")) {
        return Err("请使用 .pdf 扩展名保存副本".into());
    }
    if bytes.len() > 600 * 1024 * 1024 || !bytes.starts_with(b"%PDF-") {
        return Err("导出数据不是有效 PDF，或超过 600 MB".into());
    }
    // Never overwrite an original, an earlier export, or a symlink to either.
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)
        .map_err(|e| if e.kind() == std::io::ErrorKind::AlreadyExists {
            "该文件已存在，请换一个新文件名保存手写副本。".into()
        } else { format!("无法保存 PDF 副本：{e}") })?;
    file.write_all(bytes).and_then(|_| file.sync_all())
        .map_err(|e| format!("PDF 副本未完整写入：{e}"))
}

#[tauri::command]
pub async fn export_pdf(app: tauri::AppHandle, request: tauri::ipc::Request<'_>) -> Result<bool, String> {
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("PDF 导出需要二进制内容".into()),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app.dialog().file().set_title("导出手写 PDF 副本（请选择新文件名）")
            .set_file_name("RhineArchive-handwriting.pdf").add_filter("PDF", &["pdf"]).blocking_save_file();
        let Some(file) = picked else { return Ok(false) };
        write_copy(&file.into_path().map_err(|e| e.to_string())?, &bytes)?;
        Ok(true)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn export_never_overwrites_and_rejects_invalid_data() {
        let root = std::env::temp_dir().join(format!("rhine-export-{}", std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir(&root).unwrap();
        let path = root.join("手写.pdf");
        assert!(write_copy(&path, b"not pdf").is_err());
        assert!(!path.exists());
        assert!(write_copy(&root.join("wrong.txt"), b"%PDF-1.7").is_err());
        write_copy(&path, b"%PDF-original").unwrap();
        assert!(write_copy(&path, b"%PDF-new").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"%PDF-original");
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_dir(&root).unwrap();
    }
}
