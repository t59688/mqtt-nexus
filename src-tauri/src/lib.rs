mod ai;
mod commands;
mod config_store;
mod history;
mod models;
mod mqtt;
mod state;

use commands::{
    ai_generate_payload, app_config_export, app_ready, get_app_config_paths, history_clear,
    history_delete_connection, history_export, history_pick_export_path, history_query_before,
    history_query_latest, load_app_config, mqtt_connect, mqtt_disconnect, mqtt_publish,
    mqtt_subscribe, mqtt_unsubscribe, open_app_config_dir, save_app_config, topic_catalog_export,
};
use state::AppState;
use std::time::Duration;
use tauri::Manager;
use tauri::WebviewWindowBuilder;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let main_window_config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "main")
                .cloned()
                .ok_or_else(|| {
                    std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "main window config not found",
                    )
                })?;

            std::thread::spawn(move || {
                // Let splashscreen paint first, then build the hidden main window.
                std::thread::sleep(Duration::from_millis(45));
                let result = WebviewWindowBuilder::from_config(&app_handle, &main_window_config)
                    .and_then(|builder| builder.build());
                if let Err(error) = result {
                    eprintln!("Failed to create main window in setup: {error}");
                    if let Some(main_window) = app_handle.get_webview_window("main") {
                        let _ = main_window.show();
                    }
                    if let Some(splash_window) = app_handle.get_webview_window("splashscreen") {
                        let _ = splash_window.close();
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            mqtt_connect,
            mqtt_disconnect,
            mqtt_subscribe,
            mqtt_unsubscribe,
            mqtt_publish,
            ai_generate_payload,
            load_app_config,
            save_app_config,
            get_app_config_paths,
            open_app_config_dir,
            history_query_latest,
            history_query_before,
            history_clear,
            history_delete_connection,
            history_export,
            history_pick_export_path,
            topic_catalog_export,
            app_config_export,
            app_ready,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
