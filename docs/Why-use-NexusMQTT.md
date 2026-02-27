# NexusMQTT: A Complete Overview of Features and Usage

For real-world IoT development and backend integration, an MQTT client is no longer a "connect and forget" toy. It is a productivity tool you stare at every day. NexusMQTT does one simple but important thing: it takes all the scattered connections, topics, scripts, and historical data in your hands and turns them into an organized "workspace", so you make fewer mistakes and see more clearly in complex environments.

## 1. What problems does this tool actually solve?

Traditional MQTT clients tend to have a few common traits:

- **Single-connection centric**: you operate one connection at a time, then close it when done.
- **Ad‑hoc topics**: you type topics temporarily, send a message, and then lose the structure.
- **Weak history**: messages are kept only in memory or have very limited export options.
- **Manual environment switching**: local / test / production are switched by hand-editing configs, which is error-prone.

Once the system becomes complex—dozens of topics, multiple brokers, multiple collaborators, and long-running debugging sessions—you quickly run into several pain points:

- Connection configs are scattered everywhere, making it hard to form a **shared team workspace**.
- Topic descriptions live only in people's heads or wiki pages; the client itself has no context.
- When you need to trace an issue, there is no complete message trail, or exporting data is costly.
- For even simple load tests or continuous publishing, you have to hand-write scripts.

**NexusMQTT’s core goal is to elevate these scattered operations into workspace-level asset management**:

- Connections, brokers, credentials, topic catalogs, history, and AI settings are all managed in a single unified workspace.
- The tool itself becomes the team’s "MQTT debugging console", instead of a throwaway utility on one engineer’s laptop.

## 2. Core features: a full loop from connection to topic

### 2.1 Multi-connection workspace and centralized configuration

- Manage multiple MQTT connections in a single window, grouped by environment or business domain, with search and one-click copy.
- Centrally manage brokers and credentials:
  - **Broker**: protocol / host / port / mount path.
  - **Identity**: username / password / fixed Client ID.
  - **Connection**: simply references these assets, reducing repeated configuration.
- Quickly duplicate connections from the sidebar using the context menu or shortcuts (Ctrl/Cmd + C / V), including their topic catalogs, so you don’t need to remodel everything.

### 2.2 Topic Workbench: treat topics as "document objects"

Most of NexusMQTT’s differentiation is embodied in the **Topic Workbench**:

- Manage all topics under a connection using a tree-like directory:
  - Topic string, display name, QoS, retain flag, direction (publish / subscribe / both).
  - Content-Type, tags, description, and other metadata.
  - Optional JSON Schema.
- For each topic, maintain:
  - **Payload templates**: the standard structure agreed upon by the team.
  - **Sample payloads**: typical messages most frequently used during debugging.
- During integration, you can use the workbench to:
  - Subscribe / unsubscribe individual topics.
  - Publish messages using templates or samples with one click.
  - Configure automatic scheduled publishing tasks:
    - Run continuously until manually stopped.
    - Stop after a fixed number of messages.
    - End at a specific time point (with quick options like +2 / +5 minutes).
- The entire topic catalog can be imported/exported as JSON for each connection, making it easy to share within the team and version using Git.

The essence of this design is to **upgrade topics from ephemeral parameters to versionable assets**, bringing MQTT usage closer to how we manage API contracts and interface documentation.

### 2.3 Message log and history: turn transient traffic into traceable data

For real integration work, just seeing "a few recent messages" is not enough. You care more about what happened over a period of time. NexusMQTT provides a complete loop here:

- **Message log panel**:
  - Direction (inbound / outbound), QoS, retain flag, timestamp, topic, and payload at a glance.
  - Topic colors inherit from subscription settings, so you can visually distinguish which subscription a message comes from.
  - Mute subscriptions (including wildcards) to filter out noisy traffic.
- **History management** (desktop mode uses local SQLite):
  - Scroll upward to automatically load older history instead of only keeping the current page.
  - Filter by topic or payload keywords; pause auto-scroll to inspect specific segments.
  - Clear the current view and persisted history per connection to control data volume.
- **Export capabilities**:
  - Export NDJSON or CSV files per connection for import into other log systems or script-based analysis.
  - Integrate with your existing data analysis tools instead of being locked into the client itself.

### 2.4 AI payload generation: offload "hand-crafting JSON"

In many teams, authoring MQTT payloads is repetitive and error-prone. NexusMQTT integrates an **OpenAI-compatible AI interface**:

- Configure Base URL, API key, and model name in settings to plug into your existing model services.
- In the Topic Workbench, click "AI Generate" for any topic to create a reasonable JSON payload template.
- The Rust backend, built on `rig-core`, strictly enforces JSON validity, ensuring the frontend always receives a usable structure instead of semi-structured text.

This is not about chasing AI buzzwords. It is a pragmatic way to offload a low-value, error-prone step to machines, so humans can focus on business logic and protocol design.

### 2.5 Import / export configuration and multi-platform support

- All workspace state—connections, brokers, credentials, AI config, topic catalogs, and UI preferences—is stored locally using config files and SQLite.
- In settings, you can:
  - Export the entire configuration to a JSON backup with one click.
  - Restore the whole workspace from a backup JSON when migrating to a new machine or environment.
- Supported runtime modes:
  - **Pure web mode**: ideal for quick debugging or for backend/frontend engineers to connect temporarily.
  - **Tauri desktop mode**: enables the local history database and native dialogs, better suited as a long-term primary workbench.

## 3. Typical usage scenarios

### Scenario 1: Multi-environment integration and regression verification

- Create separate connections and groups for local, test, pre-production, and production.
- Share a single set of broker and identity configurations to reduce configuration drift.
- Use the Topic Workbench to maintain a shared topic catalog; switching environments only changes connections, not topics.
- When issues arise, export messages for a specific time window from history and hand them to backend or data colleagues for analysis.

### Scenario 2: Protocol design and team collaboration

- In the Topic Workbench, maintain each topic’s direction, payload templates, examples, and schemas as a "living document".
- Import/export the topic catalog as JSON and keep it under version control, reviewed alongside code.
- New team members can simply import the catalog into NexusMQTT to immediately start debugging with a unified view, instead of copy-pasting configs.

### Scenario 3: Automated publishing and lightweight load testing

- Configure scheduled publishing tasks for key topics to simulate load using fixed intervals or fixed counts.
- Combine local history and exported datasets to observe how the system behaves over a period of time.
- Avoid maintaining separate scripts or dedicated load-testing projects for simple scenarios.

## 4. Who is NexusMQTT for?

By design, NexusMQTT is best used as the **daily workbench** for the following roles:

- **IoT / backend engineers**: day-to-day message debugging, history review, and protocol evolution verification.
- **Test engineers**: replace ad-hoc scripts with topic catalogs and scheduled publishing, accumulating reusable test cases.
- **Ops / SRE**: during on-site incident handling, quickly bring up historical messages and export data to cross-check with monitoring systems.
- **Team leads / architects**: move MQTT-related assets from personal tools into a shareable, backup-friendly team workspace.

If you only send a couple of demo messages occasionally, any lightweight client is fine.
If you interact with MQTT every day, NexusMQTT is more like a **long-term investment**—you spend time building a solid workspace once, and every future debugging, regression, and load test benefits from it.

## 5. Closing thoughts

NexusMQTT is not trying to "reinvent the MQTT client". It acknowledges a simple reality: today’s MQTT usage has far exceeded the design boundaries of early lightweight tools. What NexusMQTT does is integrate connections, topics, history, AI generation, and configuration management into a single organized workspace, so that in the face of complex systems you feel less frantic and enjoy more control and predictability.
