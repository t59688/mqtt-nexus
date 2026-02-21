# NexusMQTT

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

面向桌面与 Web 的多连接 MQTT 客户端，采用 **Tauri 2 + React + Rust** 构建，支持实时消息、多连接管理、主题订阅与 AI 载荷生成。

**语言：** [English](README.md) · [中文](README.cn.md)

---

## 目录

- [功能特性](#功能特性)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [构建](#构建)
- [配置](#配置)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [许可证](#许可证)

---

## 功能特性

- **多连接** — 在同一窗口管理多个 MQTT broker 与连接
- **实时消息** — 订阅、发布与监控主题，实时刷新
- **Rust 后端** — 使用 [rumqttc](https://github.com/bytebeamio/rumqttc) 实现 MQTT（含 WebSocket），连接与订阅逻辑集中在 Rust
- **AI 载荷生成** — 通过兼容 OpenAI 的接口（[rig-core](https://github.com/rig-rs/rig)）生成发布内容
- **桌面与 Web** — 可打包为 Tauri 桌面应用，也可仅运行 Web 前端
- **多语言** — 支持英文与中文界面

---

## 环境要求

- **Node.js** 18+ 与 **npm**
- **Rust**（桌面版构建）：[rustup](https://rustup.rs/)
- **Tauri 系统依赖**：[Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)

---

## 快速开始

### 1. 克隆与安装

```bash
git clone https://github.com/your-org/mqtt-nexus.git
cd mqtt-nexus
npm install
```

### 2. 运行

**仅 Web 前端（无需 Rust）：**

```bash
npm run dev
```

**桌面应用（Tauri）：**

```bash
npm run tauri dev
```

---

## 构建

**前端（Web 资源）：**

```bash
npm run build
```

**桌面安装包 / 二进制：**

```bash
npm run tauri build
```

输出位于 `src-tauri/target/release/`（安装包在对应 bundle 目录）。

---

## 配置

### AI（兼容 OpenAI）载荷生成

应用支持任意兼容 OpenAI 的 API，可通过环境变量（或应用内若支持）配置：

| 变量 | 说明 |
|------|------|
| `OPENAI_BASE_URL` 或 `AI_BASE_URL` | API 基础地址 |
| `OPENAI_API_KEY` 或 `AI_API_KEY` | API 密钥 |
| `OPENAI_MODEL` 或 `AI_MODEL` | 模型名称（如 `gpt-4o-mini`） |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, Vite, TypeScript, i18next |
| 桌面壳 | Tauri 2 |
| 后端（Rust） | rumqttc（MQTT + WebSocket）、rig-core（AI）、rusqlite、tokio |

前端与 Rust 通过 Tauri 的 `invoke` 及 `emit`/`listen` 事件通信。

---

## 项目结构

```
mqtt-nexus/
├── src-tauri/          # Tauri + Rust（MQTT、AI、DB）
├── i18n/               # 语言包（en、zh）
├── App.tsx             # 主 React 界面
├── index.html
└── package.json
```

---

## 许可证

MIT。详见 [LICENSE](LICENSE)。
