use tauri::{menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem as Native, Submenu}, Emitter};

pub fn install(app: &tauri::App) -> tauri::Result<()> {
    let menu = Menu::with_items(app, &[
        &Submenu::with_items(app, "RHINE ARCHIVE", true, &[
            &Native::about(app, Some("关于莱茵档案"), Some(AboutMetadata {
                name: Some("RHINE ARCHIVE".into()), version: Some(env!("CARGO_PKG_VERSION").into()), ..Default::default()
            }))?,
            &Native::separator(app)?,
            &Native::services(app, Some("服务"))?,
            &Native::separator(app)?,
            &Native::hide(app, Some("隐藏莱茵档案"))?,
            &Native::hide_others(app, Some("隐藏其他"))?,
            &Native::show_all(app, Some("显示全部"))?,
            &Native::separator(app)?,
            &MenuItem::with_id(app, "quit", "退出莱茵档案", true, Some("Cmd+Q"))?,
        ])?,
        &Submenu::with_items(app, "文件", true, &[
            &MenuItem::with_id(app, "open", "打开 PDF…", true, Some("Cmd+O"))?,
            &MenuItem::with_id(app, "close-tab", "关闭标签", true, Some("Cmd+W"))?,
            &MenuItem::with_id(app, "close-window", "关闭窗口", true, Some("Cmd+Shift+W"))?,
        ])?,
        &Submenu::with_items(app, "编辑", true, &[
            &MenuItem::with_id(app, "undo", "撤销", true, Some("Cmd+Z"))?,
            &MenuItem::with_id(app, "redo", "重做", true, Some("Cmd+Shift+Z"))?,
            &Native::separator(app)?,
            &Native::cut(app, Some("剪切"))?,
            &Native::copy(app, Some("复制"))?,
            &Native::paste(app, Some("粘贴"))?,
            &Native::select_all(app, Some("全选"))?,
        ])?,
        &Submenu::with_items(app, "窗口", true, &[
            &Native::minimize(app, Some("最小化"))?,
            &Native::maximize(app, Some("缩放"))?,
            &MenuItem::with_id(app, "fullscreen", "切换全屏", true, Some("Ctrl+Cmd+F"))?,
        ])?,
    ])?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| { let _ = app.emit("native-action", event.id().as_ref()); });
    Ok(())
}
