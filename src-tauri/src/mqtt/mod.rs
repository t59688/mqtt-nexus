pub mod manager;
pub mod session;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum MqttError {
    #[error("connection not found: {0}")]
    ConnectionNotFound(String),
    #[error("connection command channel closed")]
    CommandChannelClosed,
    #[error("mqtt error: {0}")]
    Mqtt(#[from] rumqttc::ClientError),
}

pub fn qos_from_u8(qos: u8) -> rumqttc::QoS {
    match qos {
        1 => rumqttc::QoS::AtLeastOnce,
        2 => rumqttc::QoS::ExactlyOnce,
        _ => rumqttc::QoS::AtMostOnce,
    }
}

pub fn qos_to_u8(qos: rumqttc::QoS) -> u8 {
    match qos {
        rumqttc::QoS::AtMostOnce => 0,
        rumqttc::QoS::AtLeastOnce => 1,
        rumqttc::QoS::ExactlyOnce => 2,
    }
}

pub fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
