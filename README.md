# NexusMQTT

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

面向桌面与 Web 的多连接 MQTT 客户端，基于 **Tauri 2 + React + Rust** 构建，在一个应用中提供实时消息、连接管理、主题工作台和 AI 载荷生成能力。

**语言：** [English](README.en.md) · [中文](README.md)

<img width="1911" height="1011" alt="主界面" src="https://github.com/user-attachments/assets/0de6b909-ef86-4cd5-9e6e-2bf511148bc9" />
<img width="1914" height="1009" alt="主题工作台" src="https://github.com/user-attachments/assets/ebf68ced-ea6c-4fbe-8f5f-de725ff88032" />
<img width="1904" height="983" alt="消息日志" src="https://github.com/user-attachments/assets/bc73dbe6-6327-457c-bb05-94ce74c6f575" />
<img width="1915" height="1003" alt="设置" src="https://github.com/user-attachments/assets/20fbc516-133e-487b-8621-23b00bcda59d" />

---

<div align="center">

**欢迎关注作者**  
还有更多免费的开源软件

<br/>

<img src="https://github.com/user-attachments/assets/9cff1d14-5986-49c1-9915-174570a22f3b"
     width="200" alt="关注作者二维码" />

</div>

## 目录

- [NexusMQTT](#nexusmqtt)
  - [目录](#目录)
  - [功能特性](#功能特性)
  - [为什么选择 NexusMQTT](#为什么选择-nexusmqtt)
  - [环境要求](#环境要求)
  - [快速开始](#快速开始)
    - [1. 克隆与安装依赖](#1-克隆与安装依赖)
    - [2. 运行](#2-运行)
  - [使用说明](#使用说明)
    - [管理连接](#管理连接)
    - [主题工作台](#主题工作台)
    - [消息日志与历史](#消息日志与历史)
    - [AI 载荷生成](#ai-载荷生成)
  - [配置说明](#配置说明)
    - [AI（兼容 OpenAI）提供方](#ai兼容-openai提供方)
    - [应用配置与备份](#应用配置与备份)
  - [构建](#构建)
  - [技术栈](#技术栈)
  - [项目结构](#项目结构)
  - [参与贡献](#参与贡献)
  - [许可证](#许可证)

---

## 功能特性

- **多连接工作区**：在单个窗口中管理多个 MQTT 连接，支持 **分组**、**搜索** 与一键复制。
- **托管 Broker 与身份**：集中管理 Broker（协议/主机/端口/路径）与账号身份（用户名/密码/固定 Client ID），在连接间复用。
- **实时消息流**：订阅、发布与监控主题，按主题颜色区分，实时刷新。
- **主题工作台（Topic Workbench）**：
  - 以「目录」形式管理 MQTT 主题，包含方向（发布/订阅/双向）、QoS、保留标记、标签与 JSON Schema。
  - 为每个主题维护 **载荷模板** 与 **示例载荷**（通常为 JSON）。
  - 支持按固定间隔、固定次数或截止时间的 **自动定时发布**。
  - 支持按连接导入/导出主题目录 JSON 文件。
- **丰富的消息日志与历史**：
  - 按主题与载荷文本过滤，支持暂停自动滚动。
  - 支持对订阅（含通配符）进行静音，不再展示匹配的入站消息。
  - 向上滚动自动加载更早的历史记录（桌面模式本地 SQLite 存储）。
  - 按连接导出历史为 **NDJSON** 或 **CSV**。
- **AI 载荷生成**：通过兼容 OpenAI 的接口（基于 [rig-core](https://github.com/rig-rs/rig)），为指定主题生成合理的 JSON 载荷模板。
- **配置导入/导出**：一键备份与恢复完整工作区（连接、Broker、身份、AI 配置、主题目录等）。
- **桌面 + Web 双模式**：既可作为 Tauri 桌面应用运行，也可作为纯 Web 前端使用。
- **多语言与主题**：支持中英文界面、明暗主题切换，键盘操作友好。

---

## 为什么选择 NexusMQTT

- **以工作区为中心**：不只是「连一次就关」，而是管理一整套连接、Broker、身份与主题资产。
- **面向文档与协作**：主题工作台把 MQTT 主题当成文档对象，配合标签、Schema 与示例，方便团队共享与审查。
- **贴近生产环境**：历史记录、导出、自动发布、分组等能力，面向真实系统联调与压测，而非一次性 Demo。
- **可迁移、可备份**：所有状态存储在本地配置与 SQLite 中，可通过单一 JSON 备份文件进行迁移与恢复。

---

## 环境要求

- **Node.js** 18+ 与 **npm**
- **Rust**（用于桌面版构建）：[rustup](https://rustup.rs/)
- **Tauri 系统依赖**：参考 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)

---

## 快速开始

### 1. 克隆与安装依赖

```bash
git clone https://github.com/aizeek/mqtt-nexus.git
cd mqtt-nexus
npm install
```

### 2. 运行

**仅 Web 前端（无需 Rust 后端）：**

```bash
npm run dev
```

**桌面应用（Tauri + Rust）：**

```bash
npm run tauri dev
```

> 桌面版会启用本地历史数据库与系统级对话框；纯 Web 模式的消息仅保存在内存中。

---

## 使用说明

### 管理连接

- 在左侧边栏点击 **「添加连接」**，填写主机、端口、Client ID 与可选的分组名称。
- 在 **设置 → Broker** 中集中配置 Broker（协议/主机/端口/挂载路径），连接可引用这些 Broker。
- 在 **设置 → 身份** 中集中管理账号身份（用户名/密码/固定 Client ID），在不同连接间复用。
- 使用分组区分「生产 / 测试 / 本地」等环境，并在侧边栏上方通过搜索框按名称或主机筛选连接。
- 在侧边栏 **右键单击连接** 可进行重命名、移动分组、复制、编辑与删除等操作。
- 聚焦在侧边栏时，使用 **Ctrl/Cmd + C / V** 可复制当前连接（包含其主题目录配置）。

### 主题工作台

- 对于当前选中的连接，**主题工作台** 用于维护该连接下的一组主题：
  - 配置主题字符串、显示名称、QoS、是否保留、方向（发布/订阅/双向）、Content-Type、标签与描述。
  - 为每个主题维护 **载荷模板** 与 **示例载荷**，支持一键格式化 JSON。
  - 可选维护对应的 **JSON Schema**，用于表达载荷结构。
- 在工作台中可以：
  - 在连接已建立时，单独订阅/取消订阅主题。
  - 以模板或示例为载荷向当前连接发布消息。
  - 配置并启动 **自动定时发布** 任务：
    - 手动停止；
    - 固定消息次数；
    - 在某个时间点自动结束（可快速选择 +2/+5 分钟等预设）。
  - 按连接导入/导出主题目录 JSON 文件，便于团队共享配置。

### 消息日志与历史

- **消息日志** 面板展示入站与出站消息：
  - 每条消息包含方向（入/出）、QoS、保留标记、时间戳、主题与载荷。
  - 主题颜色继承自订阅配置；被静音的订阅不会显示对应的入站消息。
- 顶部工具栏支持：
  - 按主题或载荷内容 **关键字过滤**；
  - **暂停/恢复自动滚动**，方便浏览历史；
  - **清空** 当前连接的消息视图与（可选）持久化历史；
  - 将历史 **导出** 为 NDJSON 或 CSV，便于后续分析或导入其他系统。
- 向上滚动至顶部时，会自动从本地历史数据库中加载更早的消息记录（桌面模式）。

### AI 载荷生成

- 在 **设置 → AI** 中配置兼容 OpenAI 的模型提供方（Base URL、API Key、Model 名称）。
- 在主题工作台中使用 **「AI 生成」**，为当前主题生成 JSON 载荷模板；NexusMQTT 会要求模型仅返回严格的 JSON。
- Rust 后端会校验配置、标准化返回内容并解析为合法 JSON，再返回给前端展示。

---

## 配置说明

### AI（兼容 OpenAI）提供方

AI 配置既可以在界面中设置，也可以通过环境变量提供默认值：

| 变量                           | 说明                                                |
|--------------------------------|-----------------------------------------------------|
| `OPENAI_BASE_URL` / `AI_BASE_URL` | API 基础地址（必须以 `http://` 或 `https://` 开头） |
| `OPENAI_API_KEY` / `AI_API_KEY`   | API 密钥                                          |
| `OPENAI_MODEL` / `AI_MODEL`       | 模型名称（例如 `gpt-4o-mini`）                    |

后端基于 [rig-core](https://github.com/rig-rs/rig) 与 OpenAI 兼容客户端实现，并对返回内容做清洗，保证是有效 JSON。

### 应用配置与备份

- NexusMQTT 会将工作区（连接、Broker、身份、AI 配置、主题目录、界面偏好等）存储在本地配置文件中。
- 在 **设置 → 常规** 中可以：
  - 查看 **配置文件路径**，打开所在目录或复制路径；
  - 将当前配置 **导出** 为 JSON 备份文件；
  - 从 JSON 备份文件 **导入** 配置（会在确认后覆盖现有连接与历史）。
- 单个连接的主题目录也可以在主题工作台中单独导入/导出。

---

## 构建

**仅前端（Web 静态资源）：**

```bash
npm run build
```

**桌面安装包 / 可执行文件：**

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/` 及对应平台的安装包目录。

---

## 技术栈

| 层级       | 技术栈                                                                                                                         |
|------------|----------------------------------------------------------------------------------------------------------------------------------|
| 前端       | React 19, Vite, TypeScript, i18next                                                                                             |
| 桌面外壳   | Tauri 2                                                                                                                          |
| 后端（Rust） | [rumqttc](https://github.com/bytebeamio/rumqttc)（MQTT + WebSocket）、[rig-core](https://github.com/rig-rs/rig)（AI）、rusqlite、tokio |

前端与 Rust 通过 Tauri 的 `invoke` 命令与 `emit` / `listen` 事件进行通信。

---

## 项目结构

```text
mqtt-nexus/
├── src-tauri/          # Tauri + Rust（MQTT、AI、历史数据库）
│   ├── src/            # Rust 源码（commands、state、models、mqtt、ai、history 等）
│   └── tauri.conf.json # 窗口、打包与能力配置
├── components/         # React 组件（TopicWorkbench、MessageLog、各类弹窗等）
├── i18n/               # 语言包（en, zh）
├── App.tsx             # 主 React 应用入口
├── index.html
└── package.json
```

---

## 参与贡献

欢迎 Issue、Feature 请求与 Pull Request。

- **本地开发：** 先执行 `npm install`，再运行 `npm run tauri dev`（桌面模式）或 `npm run dev`（仅 Web）。
- **界面与交互：** 新增 UI 时请保持现有的紧凑布局、键盘友好与多语言支持（尽量复用现有 i18n key）。
- **后端扩展：** 优先在 `src-tauri/src/` 现有模块中扩展 Tauri 命令与 Rust 逻辑，而不是新建一套服务层。

如需引入较大改动（例如新增协议、替换存储引擎等），建议先通过 Issue 讨论设计方案。

---

## 许可证

项目使用 MIT 许可证，详见 [LICENSE](LICENSE)。
