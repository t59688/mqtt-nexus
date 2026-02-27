# NexusMQTT

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A professional-grade, multi-connection MQTT client for desktop and web. Built with **Tauri 2**, **React**, and **Rust** — real-time messaging, connection management, topic subscriptions, and AI-powered payload generation in one app.

**Language:** [English](README.en.md) · [中文](README.md)

<img width="1911" height="1011" alt="Main UI" src="https://github.com/user-attachments/assets/0de6b909-ef86-4cd5-9e6e-2bf511148bc9" />
<img width="1914" height="1009" alt="Topic workbench" src="https://github.com/user-attachments/assets/ebf68ced-ea6c-4fbe-8f5f-de725ff88032" />
<img width="1904" height="983" alt="Message log" src="https://github.com/user-attachments/assets/bc73dbe6-6327-457c-bb05-94ce74c6f575" />
<img width="1915" height="1003" alt="Settings" src="https://github.com/user-attachments/assets/20fbc516-133e-487b-8621-23b00bcda59d" />

---

## Table of Contents

- [NexusMQTT](#nexusmqtt)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Why NexusMQTT](#why-nexusmqtt)
  - [Prerequisites](#prerequisites)
  - [Quick Start](#quick-start)
    - [1. Clone and install](#1-clone-and-install)
    - [2. Run](#2-run)
  - [Usage](#usage)
    - [Managing connections](#managing-connections)
    - [Topic Workbench](#topic-workbench)
    - [Message log \& history](#message-log--history)
    - [AI payload generation](#ai-payload-generation)
  - [Configuration](#configuration)
    - [AI (OpenAI-compatible) provider](#ai-openai-compatible-provider)
    - [App config \& backup](#app-config--backup)
  - [Build](#build)
  - [Tech Stack](#tech-stack)
  - [Project Structure](#project-structure)
  - [Contributing](#contributing)
  - [License](#license)

---

## Features

- **Multi-connection workspace**: Manage many MQTT connections in a single window, with **groups**, **search**, and quick duplication.
- **Managed brokers & identities**: Reuse shared broker hosts and auth identities (username/password/static client ID) across connections.
- **Real-time messaging**: Subscribe, publish, and inspect MQTT traffic with live updates and per-topic colors.
- **Topic Workbench**:
  - Model your MQTT topics as a **catalog** with direction (publish/subscribe/both), QoS, retain flag, tags, and JSON schema.
  - Maintain **payload templates** and **example payloads** for each topic.
  - Run **auto publish** jobs with fixed interval, fixed count, or "until time".
  - Import/export topic catalogs as JSON.
- **Rich message log & history**:
  - Search by topic or payload, pause auto-scroll, and mute topics (including wildcard subscriptions).
  - Scroll back to load older messages from the local history database.
  - Export per-connection history to **NDJSON** or **CSV**.
- **AI-powered payload generation**: Generate realistic JSON payload templates for a topic via an OpenAI-compatible API (using [rig-core](https://github.com/rig-rs/rig)).
- **Config import/export**: Backup and restore the full workspace (connections, brokers, identities, AI settings, topic catalogs).
- **Desktop + Web**: Run as a Tauri desktop app with a Rust backend, or as a pure web frontend (no native layer).
- **i18n & theme**: English and Chinese UI, light/dark themes, keyboard-friendly UX.

---

## Why NexusMQTT

- **Workspace-first**: Instead of editing one connection at a time, you manage a *library* of connections, brokers, identities, and topics.
- **Documentation-friendly**: Topic Workbench treats MQTT topics as first-class documentation, with tags, schema, and examples.
- **Production-focused**: History, export, auto-publish, and grouping are designed for testing real systems (not just quick demos).
- **Portable**: All state is stored in local config + SQLite, so you can back up or move your workspace as a single JSON file.

---

## Prerequisites

- **Node.js** 18+ and **npm**
- **Rust** (for the desktop build): [rustup](https://rustup.rs/)
- **Tauri system deps**: see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/aizeek/mqtt-nexus.git
cd mqtt-nexus
npm install
```

### 2. Run

**Web-only (no Rust backend):**

```bash
npm run dev
```

**Desktop app (Tauri + Rust):**

```bash
npm run tauri dev
```

> The desktop app enables persistent history and native dialogs; the web-only mode keeps messages in memory only.

---

## Usage

### Managing connections

- **Create a connection** from the left sidebar (`Add connection`), filling in host, port, client ID, and optional group.
- Use **Settings → Brokers** to define shared broker endpoints (host/protocol/port/path) and link connections to them.
- Use **Settings → Identities** to manage reusable auth identities (username/password/client ID).
- Group connections (e.g. `Production`, `Staging`, `Local`) and search by name/host from the sidebar.
- In the sidebar you can **right-click** a connection to rename, move to group, duplicate, edit, or delete it.
- With the sidebar focused, **Ctrl/Cmd + C / V** duplicates the active connection (including its topic catalog).

### Topic Workbench

- For the active connection, the **Topic Workbench** lets you maintain a catalog of topics:
  - Set the MQTT topic string, name, QoS, retain, direction (publish/subscribe/both), content type, tags, and description.
  - Define **payload templates** and **example payloads** (typically JSON); use the *Format JSON* action to pretty-print.
  - Optionally keep a **JSON schema** for the payload.
- From the workbench you can:
  - Subscribe/unsubscribe to individual topics (when connected).
  - Publish either the template or example payload to the active connection.
  - Start **auto publish** jobs with:
    - manual stop,
    - fixed count (N messages), or
    - "until" a given time, with quick presets (e.g. +2, +5 minutes).
  - Import/export the topic catalog for the current connection as JSON.

### Message log & history

- The **Message Log** shows incoming and outgoing messages:
  - Per-message direction (in/out), QoS, retain flag, timestamp, topic, and payload.
  - Topic colors follow your subscriptions; muted subscriptions hide matching incoming messages.
- Use the toolbar to:
  - **Filter** by topic or payload text.
  - **Pause/resume auto-scroll** when reading older messages.
  - **Clear** the in-memory view and (optionally) persistent history for the active connection.
  - **Export** history as NDJSON or CSV for further analysis.
- Scroll to the top to automatically **load older messages** from the local history database (desktop mode).

### AI payload generation

- Configure an OpenAI-compatible provider in **Settings → AI** (base URL, API key, model).
- In Topic Workbench, use **AI Generate** to fill the payload template for a topic; NexusMQTT asks the model to return strict JSON only.
- The Rust backend validates the provider configuration and normalizes the response into valid JSON before it reaches the UI.

---

## Configuration

### AI (OpenAI-compatible) provider

You can configure AI settings either via the UI or via environment variables (for defaults):

| Variable                      | Description                                                 |
|-------------------------------|-------------------------------------------------------------|
| `OPENAI_BASE_URL` / `AI_BASE_URL` | API base URL (must start with `http://` or `https://`) |
| `OPENAI_API_KEY` / `AI_API_KEY`   | API key                                                 |
| `OPENAI_MODEL` / `AI_MODEL`       | Model name (e.g. `gpt-4o-mini`)                         |

The Rust backend uses [rig-core](https://github.com/rig-rs/rig) with an OpenAI-compatible client, and cleans up any non-JSON output.

### App config & backup

- NexusMQTT stores its workspace (connections, brokers, identities, AI config, topic catalogs, UI preferences) in a local config file.
- In **Settings → General** you can:
  - See the **config file path**, open the containing directory, or copy the path.
  - **Export** the entire app config to a JSON backup file.
  - **Import** a JSON backup (existing connections/history will be replaced after confirmation).
- Topic catalogs for a single connection can also be exported/imported from the Topic Workbench.

---

## Build

**Frontend (web assets only):**

```bash
npm run build
```

**Desktop installer / binaries:**

```bash
npm run tauri build
```

Build outputs are under `src-tauri/target/release/` (plus the platform-specific bundle folders for installers).

---

## Tech Stack

| Layer         | Stack                                                                                                                       |
|---------------|-----------------------------------------------------------------------------------------------------------------------------|
| Frontend      | React 19, Vite, TypeScript, i18next                                                                                         |
| Desktop shell | Tauri 2                                                                                                                     |
| Rust backend  | [rumqttc](https://github.com/bytebeamio/rumqttc) (MQTT + WebSocket), [rig-core](https://github.com/rig-rs/rig) (AI), rusqlite, tokio |

The frontend talks to Rust via Tauri `invoke` commands and `emit`/`listen` events.

---

## Project Structure

```text
mqtt-nexus/
├── src-tauri/          # Tauri + Rust (MQTT, AI, history DB)
│   ├── src/            # Rust sources (commands, state, models, mqtt, ai, history)
│   └── tauri.conf.json # Windowing, bundling, capabilities
├── components/         # React UI components (TopicWorkbench, MessageLog, modals, etc.)
├── i18n/               # Locales (en, zh)
├── App.tsx             # Main React application shell
├── index.html
└── package.json
```

---

## Contributing

Contributions, issues, and feature requests are welcome.

- **Run locally**: `npm install` then `npm run tauri dev` (desktop) or `npm run dev` (web-only).
- **Style & UX**: keep the existing compact, keyboard-friendly layout and i18n keys when adding UI.
- **Backend**: prefer extending the existing Tauri commands and Rust modules under `src-tauri/src/` instead of introducing a new service layer.

If you plan a large change (new protocol, storage engine, etc.), please open an issue first to discuss the design.

---

## License

MIT. See [LICENSE](LICENSE) for details.
