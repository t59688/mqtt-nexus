# NexusMQTT

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A professional-grade, multi-connection MQTT client for desktop and web. Built with **Tauri 2**, **React**, and **Rust** — real-time messaging, connection management, topic subscriptions, and AI-powered payload generation in one app.

**Language:** [English](README.md) · [中文](README.cn.md)

<img width="1911" height="1011" alt="image" src="https://github.com/user-attachments/assets/0de6b909-ef86-4cd5-9e6e-2bf511148bc9" />
<img width="1914" height="1009" alt="image" src="https://github.com/user-attachments/assets/ebf68ced-ea6c-4fbe-8f5f-de725ff88032" />
<img width="1904" height="983" alt="image" src="https://github.com/user-attachments/assets/bc73dbe6-6327-457c-bb05-94ce74c6f575" />
<img width="1915" height="1003" alt="image" src="https://github.com/user-attachments/assets/20fbc516-133e-487b-8621-23b00bcda59d" />




---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Build](#build)
- [Configuration](#configuration)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [License](#license)

---

## Features

- **Multi-connection** — Manage multiple MQTT brokers and connections in one window
- **Real-time messaging** — Subscribe, publish, and monitor topics with live updates
- **Rust backend** — MQTT via [rumqttc](https://github.com/bytebeamio/rumqttc) (including WebSocket); all connection logic in one place
- **AI payload generation** — Generate publish payloads via OpenAI-compatible APIs ([rig-core](https://github.com/rig-rs/rig))
- **Desktop + Web** — Run as a Tauri desktop app or as a web-only frontend
- **i18n** — English and 中文 (Chinese) UI

---

## Prerequisites

- **Node.js** 18+ and **npm**
- **Rust** (for desktop build): [rustup](https://rustup.rs/)
- **Tauri system deps**: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-org/mqtt-nexus.git
cd mqtt-nexus
npm install
```

### 2. Run

**Web only (no Rust):**

```bash
npm run dev
```

**Desktop app (Tauri):**

```bash
npm run tauri dev
```

---

## Build

**Frontend (web assets):**

```bash
npm run build
```

**Desktop installer / binaries:**

```bash
npm run tauri build
```

Outputs are under `src-tauri/target/release/` (and the bundle folder for installers).

---

## Configuration

### AI (OpenAI-compatible) payload generation

The app uses any OpenAI-compatible API. Set these via environment variables (or in-app if supported):

| Variable | Description |
|----------|-------------|
| `OPENAI_BASE_URL` or `AI_BASE_URL` | API base URL |
| `OPENAI_API_KEY` or `AI_API_KEY` | API key |
| `OPENAI_MODEL` or `AI_MODEL` | Model name (e.g. `gpt-4o-mini`) |

---

## Tech Stack

| Layer | Stack |
|-------|--------|
| Frontend | React 19, Vite, TypeScript, i18next |
| Desktop shell | Tauri 2 |
| Backend (Rust) | rumqttc (MQTT + WebSocket), rig-core (AI), rusqlite, tokio |

Frontend and Rust communicate via Tauri `invoke` and `emit`/`listen` events.

---

## Project Structure

```
mqtt-nexus/
├── src-tauri/          # Tauri + Rust (MQTT, AI, DB)
├── i18n/               # Locales (en, zh)
├── App.tsx             # Main React UI
├── index.html
└── package.json
```

---

## License

MIT. See [LICENSE](LICENSE) for details.
