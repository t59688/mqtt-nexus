use crate::models::{
    ConnectionStatus, MessageDirection, MqttBatchItem, MqttMessageBatchPayload, MqttStatusPayload,
    ResolvedConnection, TransportProtocol,
};
use crate::mqtt::{now_millis, qos_from_u8, qos_to_u8, MqttError};

use rumqttc::{self, AsyncClient, Event, Incoming, MqttOptions, Outgoing, Transport};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio::time::{self, Duration};

const BATCH_MAX: usize = 50;
const BATCH_FLUSH_MS: u64 = 75;

enum ClientKind {
    V4(AsyncClient),
    V5(rumqttc::v5::AsyncClient),
}

fn qos_from_u8_v5(qos: u8) -> rumqttc::v5::mqttbytes::QoS {
    match qos {
        1 => rumqttc::v5::mqttbytes::QoS::AtLeastOnce,
        2 => rumqttc::v5::mqttbytes::QoS::ExactlyOnce,
        _ => rumqttc::v5::mqttbytes::QoS::AtMostOnce,
    }
}

fn qos_to_u8_v5(qos: rumqttc::v5::mqttbytes::QoS) -> u8 {
    match qos {
        rumqttc::v5::mqttbytes::QoS::AtMostOnce => 0,
        rumqttc::v5::mqttbytes::QoS::AtLeastOnce => 1,
        rumqttc::v5::mqttbytes::QoS::ExactlyOnce => 2,
    }
}

#[derive(Debug)]
pub enum SessionCommand {
    Subscribe {
        topic: String,
        qos: u8,
    },
    Unsubscribe {
        topic: String,
    },
    Publish {
        topic: String,
        payload: String,
        qos: u8,
        retain: bool,
    },
    Disconnect,
}

pub struct MqttSessionHandle {
    command_tx: mpsc::UnboundedSender<SessionCommand>,
    command_task: JoinHandle<()>,
    event_task: JoinHandle<()>,
    batch_task: JoinHandle<()>,
}

impl MqttSessionHandle {
    pub fn send(&self, command: SessionCommand) -> Result<(), MqttError> {
        self.command_tx
            .send(command)
            .map_err(|_| MqttError::CommandChannelClosed)
    }

    pub async fn shutdown(self) {
        let _ = self.command_tx.send(SessionCommand::Disconnect);
        self.command_task.abort();
        self.event_task.abort();
        self.batch_task.abort();
    }
}

pub fn start_session(
    app: AppHandle,
    cfg: ResolvedConnection,
) -> Result<MqttSessionHandle, MqttError> {
    let (command_tx, command_rx) = mpsc::unbounded_channel::<SessionCommand>();
    let (message_tx, message_rx) = mpsc::unbounded_channel::<MqttBatchItem>();

    emit_status(
        &app,
        MqttStatusPayload {
            connection_id: cfg.id.clone(),
            status: ConnectionStatus::Connecting,
            last_error: None,
        },
    );

    let batch_task = tokio::spawn(run_batch_emitter(app.clone(), cfg.id.clone(), message_rx));

    let (client_kind, event_task) = if cfg.protocol_version == 5 {
        let options = build_v5_options(&cfg);
        let (client, mut eventloop) = rumqttc::v5::AsyncClient::new(options, 1024);
        let app_handle = app.clone();
        let connection_id = cfg.id.clone();
        let message_tx_clone = message_tx.clone();
        let event_task = tokio::spawn(async move {
            loop {
                match eventloop.poll().await {
                    Ok(rumqttc::v5::Event::Incoming(rumqttc::v5::Incoming::ConnAck(_))) => {
                        emit_status(
                            &app_handle,
                            MqttStatusPayload {
                                connection_id: connection_id.clone(),
                                status: ConnectionStatus::Connected,
                                last_error: None,
                            },
                        );
                    }
                    Ok(rumqttc::v5::Event::Incoming(rumqttc::v5::Incoming::Publish(publish))) => {
                        let _ = message_tx_clone.send(MqttBatchItem {
                            topic: String::from_utf8_lossy(publish.topic.as_ref()).into_owned(),
                            payload: String::from_utf8_lossy(publish.payload.as_ref()).into_owned(),
                            qos: qos_to_u8_v5(publish.qos),
                            retain: publish.retain,
                            direction: MessageDirection::In,
                            timestamp: now_millis(),
                        });
                    }
                    Ok(rumqttc::v5::Event::Outgoing(Outgoing::Disconnect)) => {
                        emit_status(
                            &app_handle,
                            MqttStatusPayload {
                                connection_id: connection_id.clone(),
                                status: ConnectionStatus::Disconnected,
                                last_error: None,
                            },
                        );
                    }
                    Ok(_) => {}
                    Err(error) => {
                        emit_status(
                            &app_handle,
                            MqttStatusPayload {
                                connection_id: connection_id.clone(),
                                status: ConnectionStatus::Error,
                                last_error: Some(error.to_string()),
                            },
                        );
                        break;
                    }
                }
            }
        });

        (ClientKind::V5(client), event_task)
    } else {
        let options = build_v4_options(&cfg);
        let (client, mut eventloop) = AsyncClient::new(options, 1024);
        let app_handle = app.clone();
        let connection_id = cfg.id.clone();
        let message_tx_clone = message_tx.clone();

        let event_task = tokio::spawn(async move {
            loop {
                match eventloop.poll().await {
                    Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                        emit_status(
                            &app_handle,
                            MqttStatusPayload {
                                connection_id: connection_id.clone(),
                                status: ConnectionStatus::Connected,
                                last_error: None,
                            },
                        );
                    }
                    Ok(Event::Incoming(Incoming::Publish(publish))) => {
                        let _ = message_tx_clone.send(MqttBatchItem {
                            topic: publish.topic,
                            payload: String::from_utf8_lossy(publish.payload.as_ref()).into_owned(),
                            qos: qos_to_u8(publish.qos),
                            retain: publish.retain,
                            direction: MessageDirection::In,
                            timestamp: now_millis(),
                        });
                    }
                    Ok(Event::Outgoing(Outgoing::Disconnect)) => {
                        emit_status(
                            &app_handle,
                            MqttStatusPayload {
                                connection_id: connection_id.clone(),
                                status: ConnectionStatus::Disconnected,
                                last_error: None,
                            },
                        );
                    }
                    Ok(_) => {}
                    Err(error) => {
                        emit_status(
                            &app_handle,
                            MqttStatusPayload {
                                connection_id: connection_id.clone(),
                                status: ConnectionStatus::Error,
                                last_error: Some(error.to_string()),
                            },
                        );
                        break;
                    }
                }
            }
        });

        (ClientKind::V4(client), event_task)
    };

    let connection_id = cfg.id;
    let app_handle = app;

    let command_task = tokio::spawn(async move {
        run_command_loop(app_handle, connection_id, client_kind, command_rx).await;
    });

    Ok(MqttSessionHandle {
        command_tx,
        command_task,
        event_task,
        batch_task,
    })
}

async fn run_command_loop(
    app: AppHandle,
    connection_id: String,
    client: ClientKind,
    mut command_rx: mpsc::UnboundedReceiver<SessionCommand>,
) {
    while let Some(command) = command_rx.recv().await {
        let is_disconnect = matches!(command, SessionCommand::Disconnect);
        let result: Result<(), String> = match (&client, command) {
            (ClientKind::V4(c), SessionCommand::Subscribe { topic, qos }) => c
                .subscribe(topic, qos_from_u8(qos))
                .await
                .map(|_| ())
                .map_err(|e| e.to_string()),
            (ClientKind::V5(c), SessionCommand::Subscribe { topic, qos }) => c
                .subscribe(topic, qos_from_u8_v5(qos))
                .await
                .map(|_| ())
                .map_err(|e| e.to_string()),
            (ClientKind::V4(c), SessionCommand::Unsubscribe { topic }) => c
                .unsubscribe(topic)
                .await
                .map(|_| ())
                .map_err(|e| e.to_string()),
            (ClientKind::V5(c), SessionCommand::Unsubscribe { topic }) => c
                .unsubscribe(topic)
                .await
                .map(|_| ())
                .map_err(|e| e.to_string()),
            (
                ClientKind::V4(c),
                SessionCommand::Publish {
                    topic,
                    payload,
                    qos,
                    retain,
                },
            ) => c
                .publish(topic, qos_from_u8(qos), retain, payload)
                .await
                .map(|_| ())
                .map_err(|e| e.to_string()),
            (
                ClientKind::V5(c),
                SessionCommand::Publish {
                    topic,
                    payload,
                    qos,
                    retain,
                },
            ) => c
                .publish(topic, qos_from_u8_v5(qos), retain, payload)
                .await
                .map(|_| ())
                .map_err(|e| e.to_string()),
            (ClientKind::V4(c), SessionCommand::Disconnect) => {
                c.disconnect().await.map(|_| ()).map_err(|e| e.to_string())
            }
            (ClientKind::V5(c), SessionCommand::Disconnect) => {
                c.disconnect().await.map(|_| ()).map_err(|e| e.to_string())
            }
        };

        if let Err(error) = result {
            emit_status(
                &app,
                MqttStatusPayload {
                    connection_id: connection_id.clone(),
                    status: ConnectionStatus::Error,
                    last_error: Some(error.to_string()),
                },
            );
        }

        if is_disconnect {
            emit_status(
                &app,
                MqttStatusPayload {
                    connection_id: connection_id.clone(),
                    status: ConnectionStatus::Disconnected,
                    last_error: None,
                },
            );
            break;
        }
    }
}

async fn run_batch_emitter(
    app: AppHandle,
    connection_id: String,
    mut message_rx: mpsc::UnboundedReceiver<MqttBatchItem>,
) {
    let mut interval = time::interval(Duration::from_millis(BATCH_FLUSH_MS));
    interval.set_missed_tick_behavior(time::MissedTickBehavior::Delay);
    let mut buffer: Vec<MqttBatchItem> = Vec::with_capacity(BATCH_MAX);

    loop {
        tokio::select! {
            maybe_msg = message_rx.recv() => {
                match maybe_msg {
                    Some(msg) => {
                        buffer.push(msg);
                        if buffer.len() >= BATCH_MAX {
                            flush_batch(&app, &connection_id, &mut buffer).await;
                        }
                    }
                    None => {
                        if !buffer.is_empty() {
                            flush_batch(&app, &connection_id, &mut buffer).await;
                        }
                        break;
                    }
                }
            }
            _ = interval.tick() => {
                if !buffer.is_empty() {
                    flush_batch(&app, &connection_id, &mut buffer).await;
                }
            }
        }
    }
}

async fn flush_batch(app: &AppHandle, connection_id: &str, buffer: &mut Vec<MqttBatchItem>) {
    let batch = std::mem::take(buffer);

    if batch.is_empty() {
        return;
    }

    let history_manager = app
        .state::<crate::state::AppState>()
        .history_manager
        .clone();
    if let Err(error) = history_manager
        .append_batch(app, connection_id, &batch)
        .await
    {
        emit_status(
            app,
            MqttStatusPayload {
                connection_id: connection_id.to_string(),
                status: ConnectionStatus::Error,
                last_error: Some(format!("failed to persist history: {error}")),
            },
        );
    }

    let payload = MqttMessageBatchPayload {
        connection_id: connection_id.to_string(),
        messages: batch,
    };

    let _ = app.emit("mqtt-message-batch", payload);
}

fn emit_status(app: &AppHandle, payload: MqttStatusPayload) {
    let _ = app.emit("mqtt-status", payload);
}

fn build_ws_broker_url(cfg: &ResolvedConnection, secure: bool) -> String {
    let host_input = cfg.host.trim();

    if host_input.starts_with("ws://") || host_input.starts_with("wss://") {
        return host_input.to_string();
    }

    let scheme = if secure { "wss" } else { "ws" };
    let mut path = cfg.path.trim().to_string();
    if path.is_empty() {
        path = "/mqtt".to_string();
    } else if !path.starts_with('/') {
        path = format!("/{path}");
    }

    format!("{scheme}://{host_input}:{}{path}", cfg.port)
}

fn build_v4_options(cfg: &ResolvedConnection) -> MqttOptions {
    let broker = match cfg.protocol {
        TransportProtocol::Ws => build_ws_broker_url(cfg, false),
        TransportProtocol::Wss => build_ws_broker_url(cfg, true),
        _ => cfg.host.clone(),
    };

    let mut options = MqttOptions::new(cfg.client_id.clone(), broker, cfg.port);
    options.set_keep_alive(Duration::from_secs(30));
    options.set_clean_session(cfg.clean);

    if let Some(username) = &cfg.username {
        options.set_credentials(username, cfg.password.clone().unwrap_or_default());
    }

    match cfg.protocol {
        TransportProtocol::Mqtt => {
            options.set_transport(Transport::tcp());
        }
        TransportProtocol::Mqtts => {
            options.set_transport(Transport::tls_with_default_config());
        }
        TransportProtocol::Ws => {
            options.set_transport(Transport::ws());
        }
        TransportProtocol::Wss => {
            options.set_transport(Transport::wss_with_default_config());
        }
    }

    options
}

fn build_v5_options(cfg: &ResolvedConnection) -> rumqttc::v5::MqttOptions {
    let broker = match cfg.protocol {
        TransportProtocol::Ws => build_ws_broker_url(cfg, false),
        TransportProtocol::Wss => build_ws_broker_url(cfg, true),
        _ => cfg.host.clone(),
    };

    let mut options = rumqttc::v5::MqttOptions::new(cfg.client_id.clone(), broker, cfg.port);
    options.set_keep_alive(Duration::from_secs(30));
    options.set_clean_start(cfg.clean);

    if let Some(username) = &cfg.username {
        options.set_credentials(username, cfg.password.clone().unwrap_or_default());
    }

    match cfg.protocol {
        TransportProtocol::Mqtt => {
            options.set_transport(rumqttc::Transport::tcp());
        }
        TransportProtocol::Mqtts => {
            options.set_transport(rumqttc::Transport::tls_with_default_config());
        }
        TransportProtocol::Ws => {
            options.set_transport(rumqttc::Transport::ws());
        }
        TransportProtocol::Wss => {
            options.set_transport(rumqttc::Transport::wss_with_default_config());
        }
    }

    options
}
