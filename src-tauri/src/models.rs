use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub protocol: TransportProtocol,
    pub path: Option<String>,
    pub ssl: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthIdentity {
    pub id: String,
    pub name: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub client_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub group: Option<String>,
    pub color_tag: Option<String>,
    pub broker_id: Option<String>,
    pub identity_id: Option<String>,
    pub host: String,
    pub port: u16,
    pub protocol: TransportProtocol,
    pub protocol_version: Option<u8>,
    pub path: Option<String>,
    pub ssl: bool,
    pub username: Option<String>,
    pub password: Option<String>,
    pub client_id: String,
    pub clean: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TransportProtocol {
    Mqtt,
    Mqtts,
    Ws,
    Wss,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MqttStatusPayload {
    pub connection_id: String,
    pub status: ConnectionStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MqttMessageBatchPayload {
    pub connection_id: String,
    pub messages: Vec<MqttBatchItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MqttBatchItem {
    pub topic: String,
    pub payload: String,
    pub qos: u8,
    pub retain: bool,
    pub direction: MessageDirection,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageDirection {
    In,
    Out,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayloadTemplate {
    pub id: String,
    pub name: String,
    pub topic: String,
    pub payload: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TopicDirection {
    Publish,
    Subscribe,
    Both,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicCatalogItem {
    pub id: String,
    pub name: String,
    pub topic: String,
    pub direction: TopicDirection,
    pub qos: u8,
    pub retain: bool,
    pub content_type: Option<String>,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub payload_template: Option<String>,
    pub payload_example: Option<String>,
    pub schema: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTopicDocument {
    pub version: String,
    pub updated_at: u64,
    pub topics: Vec<TopicCatalogItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NativeAppConfig {
    pub connections: Vec<ConnectionProfile>,
    pub brokers: Vec<BrokerConfig>,
    pub identities: Vec<AuthIdentity>,
    pub ai_config: Option<AiConfig>,
    pub sidebar_open: Option<bool>,
    pub language: Option<String>,
    pub theme: Option<String>,
    pub active_connection_id: Option<String>,
    pub publisher_templates: Vec<PayloadTemplate>,
    pub connection_topic_docs: HashMap<String, ConnectionTopicDocument>,
    pub updated_at: Option<u64>,
}

impl Default for NativeAppConfig {
    fn default() -> Self {
        Self {
            connections: Vec::new(),
            brokers: Vec::new(),
            identities: Vec::new(),
            ai_config: None,
            sidebar_open: None,
            language: None,
            theme: None,
            active_connection_id: None,
            publisher_templates: Vec::new(),
            connection_topic_docs: HashMap::new(),
            updated_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigPaths {
    pub config_dir: String,
    pub config_file: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMessageRecord {
    pub id: i64,
    pub timestamp: u64,
    pub topic: String,
    pub payload: String,
    pub qos: u8,
    pub retain: bool,
    pub direction: MessageDirection,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryExportResult {
    pub path: String,
    pub count: u64,
}

#[derive(Debug, Clone)]
pub struct ResolvedConnection {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub protocol: TransportProtocol,
    pub protocol_version: u8,
    pub path: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub client_id: String,
    pub clean: bool,
}
