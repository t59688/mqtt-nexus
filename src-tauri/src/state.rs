use crate::history::HistoryManager;
use crate::models::AiConfig;
use crate::mqtt::manager::MqttManager;

pub struct AppState {
    pub mqtt_manager: MqttManager,
    pub history_manager: HistoryManager,
    pub ai_defaults: AiConfig,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            mqtt_manager: MqttManager::new(),
            history_manager: HistoryManager::default(),
            ai_defaults: AiConfig {
                base_url: None,
                api_key: None,
                model: None,
            },
        }
    }
}
