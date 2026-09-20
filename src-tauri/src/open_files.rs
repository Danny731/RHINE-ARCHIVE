use std::{collections::VecDeque, path::Path, sync::Mutex};
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct OpenFiles(Mutex<VecDeque<String>>);

impl OpenFiles {
    pub fn push(&self, path: String) {
        if !Path::new(&path).extension().is_some_and(|ext| ext.eq_ignore_ascii_case("pdf")) { return; }
        if let Ok(mut queue) = self.0.lock() {
            if !queue.contains(&path) { queue.push_back(path); }
        }
    }
    pub fn pop(&self) -> Result<Option<String>, String> {
        Ok(self.0.lock().map_err(|e| e.to_string())?.pop_front())
    }
}

pub fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn queue(app: &tauri::AppHandle, paths: impl IntoIterator<Item = String>) {
    for path in paths { app.state::<OpenFiles>().push(path); }
    // Events are notifications only. Queue contents survive a not-yet-ready WebView.
    let _ = app.emit("open-pdf-pending", ());
    show_main(app);
}

#[tauri::command]
pub fn take_pending_pdf(state: tauri::State<OpenFiles>) -> Result<Option<String>, String> { state.pop() }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn queue_retains_cold_open_order_and_deduplicates_only_pending_paths() {
        let queue = OpenFiles::default();
        queue.push("/Users/example/中文 文件.PDF".into());
        queue.push("/Users/example/中文 文件.PDF".into());
        queue.push("/Users/example/second.pdf".into());
        queue.push("/Users/example/not-pdf.txt".into());
        assert_eq!(queue.pop().unwrap().as_deref(), Some("/Users/example/中文 文件.PDF"));
        queue.push("/Users/example/中文 文件.PDF".into());
        assert_eq!(queue.pop().unwrap().as_deref(), Some("/Users/example/second.pdf"));
        assert_eq!(queue.pop().unwrap().as_deref(), Some("/Users/example/中文 文件.PDF"));
        assert!(queue.pop().unwrap().is_none());
    }
}
