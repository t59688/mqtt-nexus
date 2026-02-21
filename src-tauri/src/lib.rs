mod ai;
mod commands;
mod config_store;
mod history;
mod models;
mod mqtt;
mod state;

use commands::{
    ai_generate_payload, app_config_export, get_app_config_paths, history_clear, history_delete_connection,
    history_export, history_pick_export_path, history_query_before, history_query_latest,
    load_app_config, mqtt_connect, mqtt_disconnect, mqtt_publish, mqtt_subscribe, mqtt_unsubscribe,
    open_app_config_dir, save_app_config, topic_catalog_export,
};
use state::AppState;

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
