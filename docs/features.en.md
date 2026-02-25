### Feature Documentation (English)

#### 1. Overview & Goals

NexusMQTT is a desktop + web MQTT client targeted at developers and operators who need to:

- Manage **multiple environments** (prod/stage/dev) from a single workspace.
- Build **repeatable test scenarios** with persisted topics, payload templates, examples, and schemas.
- Perform **real-world debugging and load testing** with history, export, and auto-publish tools.

#### 2. High-level Capabilities

- Multi-connection, grouped workspace
- Managed brokers and identities
- Topic Workbench (topic catalog)
- Message log and persistent history
- AI-powered payload generation (OpenAI-compatible)
- Config import/export and backups
- Desktop + web runtime modes
- i18n (English/Chinese) and light/dark themes

---

#### 3. Multi-connection workspace

**3.1 Connection profiles**

Each connection profile contains:

- Name, optional group
- Protocol (`mqtt`/`mqtts`/`ws`/`wss`)
- Host, port, path (for WS/WSS, default `/mqtt`)
- Client ID and other MQTT options (keepalive, clean session, etc.)
- Optional references to a broker and an auth identity

Profiles are listed in the left sidebar and can be activated with a single click.

**3.2 Grouping and search**

- Connections can be grouped by environment (`Production`, `Staging`, `Local`, etc.).
- Groups can be expanded/collapsed.
- A search box filters connections by name or host.

**3.3 Context menu and copy/paste**

- Right-click a connection to:
  - Rename, move to group, duplicate, edit, or delete.
- With the sidebar focused and no text selected:
  - **Ctrl/Cmd + C / V** duplicates the active connection, including its topic catalog.

---

#### 4. Managed brokers and identities

**4.1 Brokers**

- In the `Brokers` tab of the settings modal you can define reusable brokers:
  - Protocol, host, port, mount path.
  - Path and SSL flags are normalized based on protocol.
- Connections can link to brokers by ID, avoiding repeated host/port configuration.

**4.2 Identities**

- The `Identities` tab lets you define reusable identities:
  - Display name, username, password, static client ID.
- Connections can reference identities for centralized credential management.

---

#### 5. Topic Workbench

**5.1 Topic catalog model**

For each connection there is a `ConnectionTopicDocument`:

- A `topics` array of `TopicCatalogItem` with:
  - `name`, `topic`, `direction` (`publish` / `subscribe` / `both`),
  - `qos`, `retain`, `contentType`, `description`,
  - `tags`, `payloadTemplate`, `payloadExample`, `schema`.
- JSON-related fields support **formatting** to pretty-printed JSON.

**5.2 Subscribe and publish**

- From the workbench you can:
  - Subscribe/unsubscribe to a topic when the connection is active.
  - Publish using either the payload template or the example payload.
- A topic context menu provides one-click actions for:
  - Subscribe/unsubscribe,
  - Publish example,
  - Publish template,
  - Start/stop auto publish.

**5.3 Auto publish**

For any publishable topic you can start an auto publish job:

- `intervalSeconds`: send interval in seconds.
- `stopMode`:
  - `manual`: run until stopped;
  - `count`: stop after N messages;
  - `until`: stop at a specific timestamp (with quick presets such as +2/+5 minutes).
- Payload is taken from either `payloadTemplate` or `payloadExample` (whichever is non-empty).

Jobs are:

- Stopped automatically when the connection disconnects,
- Removed when the topic is deleted,
- Reflected in the UI with a small status badge per topic.

**5.4 Import/export topic catalogs**

- Each connection’s topic catalog can be exported/imported as JSON (`TopicCatalogFile`).
- Files include a `magic` value and version for validation.
- Import prompts the user before overwriting existing topics.

---

#### 6. Message log and history

**6.1 Real-time message log**

For the active connection the message log shows:

- Direction (`in`/`out`), QoS, retain flag,
- Timestamp (down to milliseconds),
- Topic (colored by subscription),
- Raw payload (monospace viewer with scroll).

Users can:

- Filter by topic or payload text,
- Pause/resume auto-scroll,
- Clear the in-memory view and (optionally) persistent history.

**6.2 Subscription matching and muting**

- For each incoming message, the app tries to find a matching subscription:
  - First by exact match,
  - Then by MQTT wildcard rules (`+` and `#` converted to regex).
- Subscriptions can be marked as **muted**:
  - Incoming messages whose topics match a muted subscription are hidden from the log.

**6.3 Persistent history**

Desktop mode uses a local SQLite database to store message history:

- `history_query_latest` loads the latest N messages per connection.
- `history_query_before` paginates backwards using a timestamp + ID cursor.

The UI will:

- Show a “scroll up to load older” hint at the top,
- Fetch older messages when you scroll near the top,
- Preserve scroll offset after loading.

**6.4 Exporting history**

Per-connection history can be exported as:

- **NDJSON**: one JSON object per line,
- **CSV**: for spreadsheet / BI import.

Desktop builds use native file pickers to choose the export path.

---

#### 7. AI-powered payload generation

**7.1 Config merging and validation**

The AI config is built from:

- Defaults (optionally set via environment variables),
- User-provided settings from the **AI** tab.

The backend enforces:

- Non-empty API key,
- Base URL starting with `http://` or `https://`,
- Non-empty model name.

**7.2 Generation pipeline**

- A prompt is built describing:
  - The MQTT topic,
  - A free-form description.
- The OpenAI-compatible client (via `rig-core`) is used to request a completion.

The backend then:

- Strips any Markdown fences,
- Tries to parse the whole string as JSON,
- If that fails, scans for the first balanced JSON object/array and parses it,
- Returns a clear error if parsing still fails.

The normalized JSON is pretty-printed and stored in the topic’s `payloadTemplate`.

---

#### 8. App configuration and workspace

**8.1 Configuration contents**

The app config (`NativeAppConfig`) includes:

- All connection profiles,
- Brokers and identities,
- AI configuration,
- Sidebar state, language, theme,
- Active connection ID,
- Per-connection topic documents,
- Publisher templates and other UI state.

**8.2 Auto-save with debouncing**

The frontend:

- Watches the relevant pieces of state,
- Serializes the entire config to JSON,
- Debounces writes (short timeout) and skips if nothing changed,
- Calls `save_app_config` on the Rust side to persist the config.

**8.3 Import/export workspace**

- Export:
  - Dumps a JSON file with a `magic` value for validation.
- Import:
  - Validates `magic`,
  - Asks for user confirmation,
  - Disconnects active MQTT sessions when needed,
  - Replaces connections, brokers, identities, AI config, topic docs, and the active connection.

---

#### 9. Runtime modes and platforms

- **Desktop mode (Tauri + Rust)**:
  - Handles MQTT (via `rumqttc`), history database (rusqlite), file I/O, and native dialogs.
- **Web-only mode**:
  - Does not require Rust/Tauri,
  - Keeps history in memory,
  - Uses browser downloads for config and catalog export.

---

#### 10. Internationalization and theming

- Text is managed by `i18next`:
  - The app ships with English and Chinese locales.
  - Users can switch language at runtime via settings.
- Theme:
  - `light` and `dark` themes,
  - Stored in local storage and reflected via a `data-theme` attribute,
  - Defaults to system preference when available.