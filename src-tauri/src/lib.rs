use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    window::Window,
    LogicalPosition,
};

// ─── Window Management ───────────────────────────────────────────────

fn get_peek_window(app: &AppHandle) -> Option<Window> {
    app.get_webview_window("peekaboo")
}

#[tauri::command]
pub fn show_peek(app: AppHandle) {
    if let Some(window) = get_peek_window(&app) {
        // Position on the current monitor before showing — never reposition after visible
        if let Ok(Some(monitor)) = window.current_monitor() {
            let size = monitor.size();
            let scale = monitor.scale_factor();

            // Spotlight position: centered horizontally, 28% from top
            let logical_w = size.width as f64 / scale;
            let logical_h = size.height as f64 / scale;
            let x = (logical_w / 2.0) - 330.0;
            let y = logical_h * 0.28;

            let _ = window.set_position(LogicalPosition::new(x, y));
        }
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit("peek-visibility", true);
    }
}

#[tauri::command]
pub fn hide_peek(app: AppHandle) {
    if let Some(window) = get_peek_window(&app) {
        let _ = window.hide();
        let _ = app.emit("peek-visibility", false);
    }
}

#[tauri::command]
pub fn toggle_peek(app: AppHandle) {
    if let Some(window) = get_peek_window(&app) {
        if window.is_visible().unwrap_or(false) {
            hide_peek(app);
        } else {
            show_peek(app);
        }
    }
}

// ─── Notifications ───────────────────────────────────────────────────

#[tauri::command]
pub fn show_notification(app: AppHandle, title: String, body: String) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
}

// ─── Window Resize ──────────────────────────────────────────────────

#[tauri::command]
pub fn resize_peek(app: AppHandle, width: f64, height: f64) {
    if let Some(window) = get_peek_window(&app) {
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
    }
}

// ─── App Bootstrap ──────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single instance: second launch triggers show
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_peek(app.clone());
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations(
                    "sqlite:peekaboo.db",
                    vec![tauri_plugin_sql::Migration {
                        version: 1,
                        description: "Create sessions and messages tables",
                        sql: include_str!("../../src/db/migrations/001_initial.sql"),
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    }],
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            show_peek,
            hide_peek,
            toggle_peek,
            show_notification,
            resize_peek,
        ])
        .setup(|app| {
            // ── System Tray ──
            let show_item = MenuItem::with_id(app, "show", "Show Peekaboo", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .tooltip("Peekaboo")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_peek(app.clone()),
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // ── Focus Loss → Hide ──
            let app_handle = app.handle().clone();
            if let Some(window) = get_peek_window(&app.handle()) {
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let _ = app_handle.emit("peek-focus-lost", ());
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Peekaboo");
}
