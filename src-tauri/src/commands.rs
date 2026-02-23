use crate::ai::payload::generate_payload;
use crate::config_store;
use crate::models::{
    AiConfig, AppConfigPaths, AuthIdentity, BrokerConfig, ConnectionProfile, HistoryExportResult,
    HistoryMessageRecord, NativeAppConfig, ResolvedConnection, TransportProtocol,
};
use crate::mqtt::now_millis;
use crate::state::AppState;
use rfd::FileDialog;
use std::fs;
use std::path::PathBuf;
use tauri::{Manager, State};

#[tauri::command(rename_all = "camelCase")]
pub async fn mqtt_connect(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    profile: ConnectionProfile,
    brokers: Vec<BrokerConfig>,
    identities: Vec<AuthIdentity>,
) -> Result<(), String> {
    let resolved = resolve_connection(profile, brokers, identities)?;
    state
        .mqtt_manager
        .connect(app, resolved)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn mqtt_disconnect(
    state: State<'_, AppState>,
    connection_id: String,
) -> Result<(), String> {
    state
        .mqtt_manager
        .disconnect(&connection_id)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn mqtt_subscribe(
    state: State<'_, AppState>,
    connection_id: String,
    topic: String,
    qos: u8,
) -> Result<(), String> {
    state
        .mqtt_manager
        .subscribe(&connection_id, topic, qos)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn mqtt_unsubscribe(
    state: State<'_, AppState>,
    connection_id: String,
    topic: String,
) -> Result<(), String> {
    state
        .mqtt_manager
        .unsubscribe(&connection_id, topic)
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn mqtt_publish(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    connection_id: String,
    topic: String,
    payload: String,
    qos: u8,
    retain: bool,
) -> Result<(), String> {
    state
        .mqtt_manager
        .publish(&connection_id, topic.clone(), payload.clone(), qos, retain)
        .map_err(|e| e.to_string())?;

    state
        .history_manager
        .append_outgoing(&app, &connection_id, &topic, &payload, qos, retain)
        .await
        .map_err(|e| format!("published, but failed to persist outgoing history: {e}"))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn ai_generate_payload(
    state: State<'_, AppState>,
    topic: String,
    description: String,
    options: Option<AiConfig>,
) -> Result<String, String> {
    generate_payload(&topic, &description, &state.ai_defaults, &options)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn load_app_config(app: tauri::AppHandle) -> Result<NativeAppConfig, String> {
    config_store::load_config(&app).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn save_app_config(app: tauri::AppHandle, config: NativeAppConfig) -> Result<(), String> {
    config_store::save_config(&app, &config).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn app_ready(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(main_window) = app.get_webview_window("main") {
        main_window.show().map_err(|e| e.to_string())?;
        let _ = main_window.set_focus();
    }

    if let Some(splash_window) = app.get_webview_window("splashscreen") {
        let _ = splash_window.close();
    }

    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn get_app_config_paths(app: tauri::AppHandle) -> Result<AppConfigPaths, String> {
    config_store::app_config_paths(&app).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn open_app_config_dir(app: tauri::AppHandle) -> Result<(), String> {
    config_store::open_config_dir(&app).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn history_query_latest(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    connection_id: String,
    limit: Option<usize>,
) -> Result<Vec<HistoryMessageRecord>, String> {
    state
        .history_manager
        .query_latest(&app, &connection_id, limit.unwrap_or(200))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn history_query_before(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    connection_id: String,
    before_ts: u64,
    before_id: i64,
    limit: Option<usize>,
) -> Result<Vec<HistoryMessageRecord>, String> {
    state
        .history_manager
        .query_before(
            &app,
            &connection_id,
            before_ts,
            before_id,
            limit.unwrap_or(200),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn history_clear(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    connection_id: String,
) -> Result<(), String> {
    state
        .history_manager
        .clear_connection(&app, &connection_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn history_delete_connection(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    connection_id: String,
) -> Result<(), String> {
    state
        .history_manager
        .delete_connection(&app, &connection_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn history_export(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    connection_id: String,
    format: Option<String>,
    from_ts: Option<u64>,
    to_ts: Option<u64>,
    output_path: Option<String>,
) -> Result<HistoryExportResult, String> {
    let normalized_format = format
        .as_deref()
        .map(str::to_lowercase)
        .unwrap_or_else(|| "ndjson".to_string());
    state
        .history_manager
        .export_connection(
            &app,
            &connection_id,
            &normalized_format,
            from_ts,
            to_ts,
            output_path.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub async fn history_pick_export_path(
    connection_id: String,
    format: Option<String>,
) -> Result<Option<String>, String> {
    let normalized_format = format
        .as_deref()
        .map(str::to_lowercase)
        .unwrap_or_else(|| "ndjson".to_string());
    let ext = if normalized_format == "csv" {
        "csv"
    } else {
        "ndjson"
    };
    let file_name = format!(
        "{}-history-{}.{}",
        safe_name(&connection_id),
        now_millis(),
        ext
    );

    let mut dialog = FileDialog::new().set_file_name(&file_name);
    dialog = if ext == "csv" {
        dialog.add_filter("CSV", &["csv"])
    } else {
        dialog.add_filter("NDJSON", &["ndjson"])
    };

    Ok(dialog.save_file().map(|p| normalize_selected_path(p, ext)))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn topic_catalog_export(
    connection_id: String,
    content: String,
) -> Result<Option<String>, String> {
    let file_name = format!(
        "{}-topic-catalog-{}.json",
        safe_name(&connection_id),
        now_millis()
    );

    let selected = FileDialog::new()
        .set_file_name(&file_name)
        .add_filter("JSON", &["json"])
        .save_file();

    let Some(path) = selected else {
        return Ok(None);
    };

    let normalized = normalize_selected_path(path, "json");
    let normalized_path = PathBuf::from(&normalized);
    if let Some(parent) = normalized_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&normalized_path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(Some(normalized))
}

#[tauri::command(rename_all = "camelCase")]
pub async fn app_config_export(content: String) -> Result<Option<String>, String> {
    let file_name = format!("mqtt-nexus-backup-{}.json", now_millis());

    let selected = FileDialog::new()
        .set_file_name(&file_name)
        .add_filter("JSON", &["json"])
        .save_file();

    let Some(path) = selected else {
        return Ok(None);
    };

    let normalized = normalize_selected_path(path, "json");
    let normalized_path = PathBuf::from(&normalized);
    if let Some(parent) = normalized_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&normalized_path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(Some(normalized))
}

fn safe_name(input: &str) -> String {
    let mut out = String::with_capacity(input.len().max(12));
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "connection".to_string()
    } else {
        out
    }
}

fn normalize_selected_path(path: PathBuf, ext: &str) -> String {
    let has_ext = path.extension().and_then(|v| v.to_str()).is_some();
    let normalized = if has_ext {
        path
    } else {
        path.with_extension(ext)
    };
    normalized.display().to_string()
}

fn resolve_connection(
    profile: ConnectionProfile,
    brokers: Vec<BrokerConfig>,
    identities: Vec<AuthIdentity>,
) -> Result<ResolvedConnection, String> {
    let mut host = profile.host;
    let mut port = profile.port;
    let mut protocol = profile.protocol;
    let mut path = profile.path.unwrap_or_default();
    let mut username = profile.username;
    let mut password = profile.password;
    let mut client_id = profile.client_id;

    if let Some(broker_id) = profile.broker_id {
        if let Some(broker) = brokers.into_iter().find(|b| b.id == broker_id) {
            host = broker.host;
            port = broker.port;
            protocol = broker.protocol;
            path = broker.path.unwrap_or_default();
        }
    }

    if let Some(identity_id) = profile.identity_id {
        if let Some(identity) = identities.into_iter().find(|i| i.id == identity_id) {
            username = identity.username;
            password = identity.password;
            if let Some(override_client_id) = identity.client_id {
                client_id = override_client_id;
            }
        }
    }

    if host.trim().is_empty() {
        return Err("Broker host is required".to_string());
    }

    if port == 0 {
        return Err("Broker port is required".to_string());
    }

    let protocol_version = match profile.protocol_version.unwrap_or(4) {
        5 => 5,
        3 | 4 => 4,
        _ => 4,
    };

    let normalized_path = if matches!(protocol, TransportProtocol::Ws | TransportProtocol::Wss) {
        if path.trim().is_empty() {
            "/mqtt".to_string()
        } else {
            path
        }
    } else {
        String::new()
    };

    Ok(ResolvedConnection {
        id: profile.id,
        host,
        port,
        protocol,
        protocol_version,
        path: normalized_path,
        username,
        password,
        client_id,
        clean: profile.clean,
    })
}
