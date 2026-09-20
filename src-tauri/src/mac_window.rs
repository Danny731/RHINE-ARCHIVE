use crate::window_close::{Action, CloseState, Phase};
use block2::RcBlock;
use objc2::{
    rc::Retained,
    runtime::{NSObjectProtocol, ProtocolObject},
    MainThreadMarker,
};
use objc2_app_kit::{
    NSWindow, NSWindowDidEnterFullScreenNotification, NSWindowDidExitFullScreenNotification,
    NSWindowWillEnterFullScreenNotification, NSWindowWillExitFullScreenNotification,
};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSOperationQueue};
use std::{
    cell::RefCell,
    ptr::NonNull,
    sync::{mpsc, Mutex},
    time::Duration,
};
use tauri::Manager;

type Completion = mpsc::Sender<Result<(), String>>;
#[derive(Default)]
struct Controller {
    state: CloseState,
    completion: Option<Completion>,
}
type Observer = Retained<ProtocolObject<dyn NSObjectProtocol>>;
thread_local! { static OBSERVERS: RefCell<Vec<Observer>> = const { RefCell::new(Vec::new()) }; }

fn complete(app: &tauri::AppHandle, ticket: u64, result: Result<(), String>) {
    let state = app.state::<Mutex<Controller>>();
    let sender = {
        let Ok(mut controller) = state.lock() else {
            return;
        };
        if !controller.state.finish(ticket) {
            return;
        }
        controller.completion.take()
    };
    if let Some(sender) = sender {
        let _ = sender.send(result);
    }
}

// Reopening through Dock/Finder wins over a still-pending close request.
fn cancel_pending(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<Mutex<Controller>>() else {
        return;
    };
    let ticket = state
        .lock()
        .ok()
        .and_then(|controller| controller.state.pending());
    if let Some(ticket) = ticket {
        complete(app, ticket, Ok(()));
    }
}

pub fn show_main(app: &tauri::AppHandle) {
    let app = app.clone();
    let block = RcBlock::new(move || {
        cancel_pending(&app);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    });
    unsafe {
        NSOperationQueue::mainQueue().addOperationWithBlock(&block);
    }
}

fn schedule_completion(app: tauri::AppHandle, ticket: u64, result: Result<(), String>) {
    let block = RcBlock::new(move || complete(&app, ticket, result.clone()));
    unsafe {
        NSOperationQueue::mainQueue().addOperationWithBlock(&block);
    }
}

fn advance(app: &tauri::AppHandle, ticket: u64) {
    let Some(window) = app.get_webview_window("main") else {
        complete(app, ticket, Err("阅读窗口不存在。".into()));
        return;
    };
    let state = app.state::<Mutex<Controller>>();
    let action = {
        let Ok(mut controller) = state.lock() else {
            return;
        };
        // A queued re-entry may have been requested after DidExit. Never hide
        // while it is entering another fullscreen Space.
        if controller.state.phase == Phase::Windowed && window.is_fullscreen().unwrap_or(true) {
            controller.state.transition(Phase::Fullscreen);
        }
        controller.state.action(ticket)
    };
    match action {
        Action::Wait => {}
        Action::ExitFullscreen => {
            if let Err(error) = window.set_fullscreen(false) {
                complete(app, ticket, Err(error.to_string()));
            }
        }
        Action::Hide => complete(app, ticket, window.hide().map_err(|e| e.to_string())),
    }
}

fn schedule_advance(app: tauri::AppHandle, ticket: u64) {
    let block = RcBlock::new(move || advance(&app, ticket));
    // Unlike run_on_main_thread, this always defers until the AppKit delegate
    // and notification callbacks have finished restoring the window.
    unsafe {
        NSOperationQueue::mainQueue().addOperationWithBlock(&block);
    }
}

pub fn install(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let _main =
        MainThreadMarker::new().ok_or("Window observers must be installed on the main thread")?;
    let window = app
        .get_webview_window("main")
        .ok_or("Missing main window")?;
    let mut controller = Controller::default();
    if window.is_fullscreen()? {
        controller.state.phase = Phase::Fullscreen;
    }
    app.manage(Mutex::new(controller));
    let pointer = window.ns_window()?;
    // ns_window returns an autoreleased pointer to this live AppKit window.
    // Borrow it only during main-thread observer registration, never capture it.
    let native = unsafe { &*pointer.cast::<NSWindow>() };
    let center = NSNotificationCenter::defaultCenter();
    let queue = NSOperationQueue::mainQueue();
    let notifications = unsafe {
        [
            (NSWindowWillEnterFullScreenNotification, Phase::Entering),
            (NSWindowDidEnterFullScreenNotification, Phase::Fullscreen),
            (NSWindowWillExitFullScreenNotification, Phase::Exiting),
            (NSWindowDidExitFullScreenNotification, Phase::Windowed),
        ]
    };
    for (name, phase) in notifications {
        let handle = app.handle().clone();
        let block = RcBlock::new(move |_notification: NonNull<NSNotification>| {
            let state = handle.state::<Mutex<Controller>>();
            let ticket = state
                .lock()
                .ok()
                .and_then(|mut controller| controller.state.transition(phase));
            if let Some(ticket) = ticket {
                schedule_advance(handle.clone(), ticket);
            }
        });
        let observer = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(name),
                Some(native),
                Some(&queue),
                &block,
            )
        };
        OBSERVERS.with(|tokens| tokens.borrow_mut().push(observer));
    }
    Ok(())
}

pub async fn hide_after_fullscreen(app: tauri::AppHandle) -> Result<(), String> {
    let (sender, receiver) = mpsc::channel();
    let ticket = {
        let state = app.state::<Mutex<Controller>>();
        let mut controller = state.lock().map_err(|e| e.to_string())?;
        let ticket = controller.state.begin().map_err(str::to_owned)?;
        controller.completion = Some(sender);
        ticket
    };
    schedule_advance(app.clone(), ticket);
    let timeout_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        match receiver.recv_timeout(Duration::from_secs(10)) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                // Serialize timeout with native hide/reopen. If hide completed
                // first, return its result; otherwise invalidate the ticket
                // before reporting the timeout. A late DidExit then does nothing.
                schedule_completion(
                    timeout_app,
                    ticket,
                    Err("退出全屏未完成，窗口未隐藏。请先手动退出全屏后重试。".into()),
                );
                receiver
                    .recv()
                    .unwrap_or_else(|_| Err("窗口关闭请求已结束。".into()))
            }
            Err(_) => Err("窗口关闭请求已结束。".into()),
        }
    })
    .await;
    match result {
        Ok(result) => result,
        Err(error) => {
            let message = error.to_string();
            schedule_completion(app, ticket, Err(message.clone()));
            Err(message)
        }
    }
}

pub fn shutdown(app: &tauri::AppHandle) {
    cancel_pending(app);
    OBSERVERS.with(|tokens| {
        let center = NSNotificationCenter::defaultCenter();
        for token in tokens.borrow_mut().drain(..) {
            unsafe {
                center.removeObserver(token.as_ref());
            }
        }
    });
}
