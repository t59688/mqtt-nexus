use crate::models::ResolvedConnection;
use crate::mqtt::MqttError;
use crate::mqtt::session::{MqttSessionHandle, SessionCommand, start_session};

use dashmap::DashMap;
use tauri::AppHandle;

#[derive(Default)]
pub struct MqttManager {
    sessions: DashMap<String, MqttSessionHandle>,
}

impl MqttManager {
    pub fn new() -> Self {
        Self {
            sessions: DashMap::new(),
        }
    }

    pub fn connect(&self, app: AppHandle, connection: ResolvedConnection) -> Result<(), MqttError> {
        if let Some((_, existing)) = self.sessions.remove(&connection.id) {
            tokio::spawn(existing.shutdown());
        }

        let session = start_session(app, connection.clone())?;
        self.sessions.insert(connection.id, session);
        Ok(())
    }

    pub fn disconnect(&self, connection_id: &str) -> Result<(), MqttError> {
        if let Some((_, session)) = self.sessions.remove(connection_id) {
            tokio::spawn(session.shutdown());
            Ok(())
        } else {
            Err(MqttError::ConnectionNotFound(connection_id.to_string()))
        }
    }

    pub fn subscribe(&self, connection_id: &str, topic: String, qos: u8) -> Result<(), MqttError> {
        let session = self
            .sessions
            .get(connection_id)
            .ok_or_else(|| MqttError::ConnectionNotFound(connection_id.to_string()))?;
        session.send(SessionCommand::Subscribe { topic, qos })
    }

    pub fn unsubscribe(&self, connection_id: &str, topic: String) -> Result<(), MqttError> {
        let session = self
            .sessions
            .get(connection_id)
            .ok_or_else(|| MqttError::ConnectionNotFound(connection_id.to_string()))?;
        session.send(SessionCommand::Unsubscribe { topic })
    }

    pub fn publish(
        &self,
        connection_id: &str,
        topic: String,
        payload: String,
        qos: u8,
        retain: bool,
    ) -> Result<(), MqttError> {
        let session = self
            .sessions
            .get(connection_id)
            .ok_or_else(|| MqttError::ConnectionNotFound(connection_id.to_string()))?;
        session.send(SessionCommand::Publish {
            topic,
            payload,
            qos,
            retain,
        })
    }
}
