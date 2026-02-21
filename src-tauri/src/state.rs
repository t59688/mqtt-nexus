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
        let base_url = std::env::var("OPENAI_BASE_URL")
            .ok()
            .or_else(|| std::env::var("AI_BASE_URL").ok());
        let api_key = std::env::var("OPENAI_API_KEY")
            .ok()
            .or_else(|| std::env::var("AI_API_KEY").ok());
        let model = std::env::var("OPENAI_MODEL")
            .ok()
            .or_else(|| std::env::var("AI_MODEL").ok());

        Self {
            mqtt_manager: MqttManager::new(),
            history_manager: HistoryManager::default(),
            ai_defaults: AiConfig {
                base_url,
                api_key,
                model,
            },
        }
    }
}
