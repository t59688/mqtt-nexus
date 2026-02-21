use crate::models::{HistoryExportResult, HistoryMessageRecord, MessageDirection, MqttBatchItem};
use crate::mqtt::now_millis;
use anyhow::{Context, Result};
use dashmap::DashMap;
use rusqlite::{params, Connection, OpenFlags};
use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Manager};
use tokio::sync::RwLock;

const HISTORY_DIR_NAME: &str = "history";
const EXPORTS_DIR_NAME: &str = "exports";
const MAX_QUERY_LIMIT: usize = 1000;

#[derive(Clone, Default)]
pub struct HistoryManager {
    inner: Arc<HistoryInner>,
}

#[derive(Default)]
struct HistoryInner {
    init_lock: Mutex<()>,
    root_dir: OnceLock<PathBuf>,
    exports_dir: OnceLock<PathBuf>,
    guards: DashMap<String, Arc<RwLock<()>>>,
}

impl HistoryManager {
    fn ensure_paths(&self, app: &AppHandle) -> Result<(PathBuf, PathBuf)> {
        if let (Some(root), Some(exports)) =
            (self.inner.root_dir.get(), self.inner.exports_dir.get())
        {
            return Ok((root.clone(), exports.clone()));
        }

        let _guard = self
            .inner
            .init_lock
            .lock()
            .map_err(|_| anyhow::anyhow!("history init lock poisoned"))?;

        if let (Some(root), Some(exports)) =
            (self.inner.root_dir.get(), self.inner.exports_dir.get())
        {
            return Ok((root.clone(), exports.clone()));
        }

        let config_dir = app
            .path()
            .app_config_dir()
            .context("failed to resolve app config directory")?;

        fs::create_dir_all(&config_dir).with_context(|| {
            format!(
                "failed to create app config directory: {}",
                config_dir.display()
            )
        })?;

        let history_root = config_dir.join(HISTORY_DIR_NAME);
        fs::create_dir_all(&history_root).with_context(|| {
            format!(
                "failed to create history directory: {}",
                history_root.display()
            )
        })?;

        let exports_dir = history_root.join(EXPORTS_DIR_NAME);
        fs::create_dir_all(&exports_dir).with_context(|| {
            format!(
                "failed to create exports directory: {}",
                exports_dir.display()
            )
        })?;

        cleanup_deleting_files(&history_root)?;

        let _ = self.inner.root_dir.set(history_root.clone());
        let _ = self.inner.exports_dir.set(exports_dir.clone());

        Ok((history_root, exports_dir))
    }

    fn guard_for(&self, connection_id: &str) -> Arc<RwLock<()>> {
        if let Some(existing) = self.inner.guards.get(connection_id) {
            return Arc::clone(existing.value());
        }

        let guard = Arc::new(RwLock::new(()));
        let entry = self
            .inner
            .guards
            .entry(connection_id.to_string())
            .or_insert_with(|| Arc::clone(&guard));
        Arc::clone(entry.value())
    }

    fn db_path(&self, root: &Path, connection_id: &str) -> PathBuf {
        root.join(format!("{}.db", safe_connection_id(connection_id)))
    }

    pub async fn append_batch(
        &self,
        app: &AppHandle,
        connection_id: &str,
        messages: &[MqttBatchItem],
    ) -> Result<()> {
        if messages.is_empty() {
            return Ok(());
        }

        let (root, _) = self.ensure_paths(app)?;
        let db_path = self.db_path(&root, connection_id);
        let guard = self.guard_for(connection_id);
        let to_insert = messages.to_vec();
        let _read_guard = guard.read().await;

        tokio::task::spawn_blocking(move || insert_batch(&db_path, &to_insert))
            .await
            .context("append batch task join failed")??;

        Ok(())
    }

    pub async fn append_outgoing(
        &self,
        app: &AppHandle,
        connection_id: &str,
        topic: &str,
        payload: &str,
        qos: u8,
        retain: bool,
    ) -> Result<()> {
        let item = MqttBatchItem {
            topic: topic.to_string(),
            payload: payload.to_string(),
            qos,
            retain,
            direction: MessageDirection::Out,
            timestamp: now_millis(),
        };
        self.append_batch(app, connection_id, &[item]).await
    }

    pub async fn query_latest(
        &self,
        app: &AppHandle,
        connection_id: &str,
        limit: usize,
    ) -> Result<Vec<HistoryMessageRecord>> {
        let bounded_limit = limit.clamp(1, MAX_QUERY_LIMIT);
        let (root, _) = self.ensure_paths(app)?;
        let db_path = self.db_path(&root, connection_id);
        if !db_path.exists() {
            return Ok(Vec::new());
        }

        let guard = self.guard_for(connection_id);
        let _read_guard = guard.read().await;

        tokio::task::spawn_blocking(move || query_latest_rows(&db_path, bounded_limit))
            .await
            .context("query latest task join failed")?
    }

    pub async fn query_before(
        &self,
        app: &AppHandle,
        connection_id: &str,
        before_ts: u64,
        before_id: i64,
        limit: usize,
    ) -> Result<Vec<HistoryMessageRecord>> {
        let bounded_limit = limit.clamp(1, MAX_QUERY_LIMIT);
        let (root, _) = self.ensure_paths(app)?;
        let db_path = self.db_path(&root, connection_id);
        if !db_path.exists() {
            return Ok(Vec::new());
        }

        let guard = self.guard_for(connection_id);
        let _read_guard = guard.read().await;

        tokio::task::spawn_blocking(move || {
            query_before_rows(&db_path, before_ts as i64, before_id, bounded_limit)
        })
        .await
        .context("query before task join failed")?
    }

    pub async fn clear_connection(&self, app: &AppHandle, connection_id: &str) -> Result<()> {
        let (root, _) = self.ensure_paths(app)?;
        let db_path = self.db_path(&root, connection_id);
        let guard = self.guard_for(connection_id);
        let _write_guard = guard.write().await;

        tokio::task::spawn_blocking(move || clear_db_file(&db_path))
            .await
            .context("clear history task join failed")??;

        Ok(())
    }

    pub async fn delete_connection(&self, app: &AppHandle, connection_id: &str) -> Result<()> {
        let (root, _) = self.ensure_paths(app)?;
        let db_path = self.db_path(&root, connection_id);
        let guard = self.guard_for(connection_id);
        let _write_guard = guard.write().await;

        tokio::task::spawn_blocking(move || delete_db_file(&db_path))
            .await
            .context("delete history task join failed")??;

        self.inner.guards.remove(connection_id);

        Ok(())
    }

    pub async fn export_connection(
        &self,
        app: &AppHandle,
        connection_id: &str,
        format: &str,
        from_ts: Option<u64>,
        to_ts: Option<u64>,
        output_path: Option<&str>,
    ) -> Result<HistoryExportResult> {
        let (root, exports_dir) = self.ensure_paths(app)?;
        let db_path = self.db_path(&root, connection_id);
        if !db_path.exists() {
            return Err(anyhow::anyhow!("no history found for this connection"));
        }

        let guard = self.guard_for(connection_id);
        let _read_guard = guard.read().await;

        let safe_id = safe_connection_id(connection_id);
        let ext = if format.eq_ignore_ascii_case("csv") {
            "csv"
        } else {
            "ndjson"
        };
        let output_path = if let Some(user_path) = output_path {
            normalize_output_path(PathBuf::from(user_path), ext)
        } else {
            exports_dir.join(format!("{safe_id}-history-{}.{}", now_millis(), ext))
        };
        let format_owned = format.to_string();

        tokio::task::spawn_blocking(move || {
            export_rows(
                &db_path,
                &output_path,
                &format_owned,
                from_ts.map(|v| v as i64),
                to_ts.map(|v| v as i64),
            )
        })
        .await
        .context("export history task join failed")?
    }
}

fn insert_batch(path: &Path, rows: &[MqttBatchItem]) -> Result<()> {
    let mut conn = open_rw_connection(path)?;
    let tx = conn
        .transaction()
        .context("failed to start history transaction")?;
    let mut stmt = tx
        .prepare(
            "INSERT INTO message_history (ts_ms, topic, payload, qos, retain, direction)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .context("failed to prepare history insert statement")?;

    for row in rows {
        stmt.execute(params![
            row.timestamp as i64,
            row.topic,
            row.payload,
            row.qos as i64,
            if row.retain { 1 } else { 0 },
            direction_to_int(row.direction),
        ])
        .context("failed to insert history row")?;
    }

    drop(stmt);
    tx.commit()
        .context("failed to commit history transaction")?;
    Ok(())
}

fn query_latest_rows(path: &Path, limit: usize) -> Result<Vec<HistoryMessageRecord>> {
    let conn = open_ro_connection(path)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, ts_ms, topic, payload, qos, retain, direction
             FROM message_history
             ORDER BY ts_ms DESC, id DESC
             LIMIT ?1",
        )
        .context("failed to prepare latest history query")?;

    let mut rows = stmt
        .query_map([limit as i64], row_to_record)
        .context("failed to execute latest history query")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("failed to map latest history rows")?;

    rows.reverse();
    Ok(rows)
}

fn query_before_rows(
    path: &Path,
    before_ts: i64,
    before_id: i64,
    limit: usize,
) -> Result<Vec<HistoryMessageRecord>> {
    let conn = open_ro_connection(path)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, ts_ms, topic, payload, qos, retain, direction
             FROM message_history
             WHERE (ts_ms < ?1) OR (ts_ms = ?1 AND id < ?2)
             ORDER BY ts_ms DESC, id DESC
             LIMIT ?3",
        )
        .context("failed to prepare paged history query")?;

    let mut rows = stmt
        .query_map(params![before_ts, before_id, limit as i64], row_to_record)
        .context("failed to execute paged history query")?
        .collect::<rusqlite::Result<Vec<_>>>()
        .context("failed to map paged history rows")?;

    rows.reverse();
    Ok(rows)
}

fn export_rows(
    db_path: &Path,
    output_path: &Path,
    format: &str,
    from_ts: Option<i64>,
    to_ts: Option<i64>,
) -> Result<HistoryExportResult> {
    let conn = open_ro_connection(db_path)?;
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create export directory: {}", parent.display()))?;
    }

    let file = fs::File::create(output_path)
        .with_context(|| format!("failed to create export file: {}", output_path.display()))?;
    let mut writer = BufWriter::new(file);

    let mut stmt = conn
        .prepare(
            "SELECT id, ts_ms, topic, payload, qos, retain, direction
             FROM message_history
             WHERE (?1 IS NULL OR ts_ms >= ?1)
               AND (?2 IS NULL OR ts_ms <= ?2)
             ORDER BY ts_ms ASC, id ASC",
        )
        .context("failed to prepare export query")?;

    let mut rows = stmt
        .query(params![from_ts, to_ts])
        .context("failed to execute export query")?;

    let is_csv = format.eq_ignore_ascii_case("csv");
    if is_csv {
        writer
            .write_all(b"id,timestamp,topic,payload,qos,retain,direction\n")
            .context("failed to write csv header")?;
    }

    let mut count: u64 = 0;
    while let Some(row) = rows.next().context("failed to iterate export rows")? {
        let record = row_to_record(row).context("failed to parse export row")?;
        if is_csv {
            let line = format!(
                "{},{},{},{},{},{},{}\n",
                record.id,
                record.timestamp,
                escape_csv(&record.topic),
                escape_csv(&record.payload),
                record.qos,
                if record.retain { 1 } else { 0 },
                if matches!(record.direction, MessageDirection::Out) {
                    "out"
                } else {
                    "in"
                }
            );
            writer
                .write_all(line.as_bytes())
                .context("failed to write csv row")?;
        } else {
            let line = serde_json::to_string(&record).context("failed to serialize ndjson row")?;
            writer
                .write_all(line.as_bytes())
                .context("failed to write ndjson row")?;
            writer
                .write_all(b"\n")
                .context("failed to write ndjson newline")?;
        }
        count += 1;
    }

    writer.flush().context("failed to flush export writer")?;

    Ok(HistoryExportResult {
        path: output_path.display().to_string(),
        count,
    })
}

fn clear_db_file(path: &Path) -> Result<()> {
    if !path.exists() {
        let _ = open_rw_connection(path)?;
        return Ok(());
    }

    remove_sidecar_files(path);
    let deleting_path = deleting_path(path);
    fs::rename(path, &deleting_path).with_context(|| {
        format!(
            "failed to rotate history file {} -> {}",
            path.display(),
            deleting_path.display()
        )
    })?;

    let _ = open_rw_connection(path)?;
    remove_sidecar_files(&deleting_path);

    if let Err(error) = fs::remove_file(&deleting_path) {
        eprintln!(
            "history cleanup deferred for {}: {}",
            deleting_path.display(),
            error
        );
    }

    Ok(())
}

fn delete_db_file(path: &Path) -> Result<()> {
    if !path.exists() {
        remove_sidecar_files(path);
        return Ok(());
    }

    remove_sidecar_files(path);
    let deleting_path = deleting_path(path);
    fs::rename(path, &deleting_path).with_context(|| {
        format!(
            "failed to mark history file for deletion {} -> {}",
            path.display(),
            deleting_path.display()
        )
    })?;
    remove_sidecar_files(&deleting_path);

    if let Err(error) = fs::remove_file(&deleting_path) {
        eprintln!(
            "history delete deferred for {}: {}",
            deleting_path.display(),
            error
        );
    }

    Ok(())
}

fn cleanup_deleting_files(root: &Path) -> Result<()> {
    let entries =
        fs::read_dir(root).with_context(|| format!("failed to scan {}", root.display()))?;
    for entry in entries {
        let entry = match entry {
            Ok(v) => v,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(v) => v,
            None => continue,
        };
        if !file_name.contains(".deleting.") {
            continue;
        }
        if let Err(error) = fs::remove_file(&path) {
            eprintln!(
                "failed to cleanup deferred history file {}: {}",
                path.display(),
                error
            );
        }
    }
    Ok(())
}

fn open_rw_connection(path: &Path) -> Result<Connection> {
    let mut conn = Connection::open(path)
        .with_context(|| format!("failed to open sqlite file: {}", path.display()))?;
    configure_connection(&mut conn, false)?;
    init_schema(&conn)?;
    Ok(conn)
}

fn open_ro_connection(path: &Path) -> Result<Connection> {
    let mut conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .with_context(|| format!("failed to open sqlite file read-only: {}", path.display()))?;
    configure_connection(&mut conn, true)?;
    Ok(conn)
}

fn configure_connection(conn: &mut Connection, read_only: bool) -> Result<()> {
    conn.busy_timeout(std::time::Duration::from_secs(5))
        .context("failed to set sqlite busy timeout")?;
    if !read_only {
        conn.pragma_update(None, "journal_mode", "WAL")
            .context("failed to set sqlite WAL mode")?;
        conn.pragma_update(None, "synchronous", "FULL")
            .context("failed to set sqlite synchronous mode")?;
    }
    Ok(())
}

fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS message_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts_ms INTEGER NOT NULL,
            topic TEXT NOT NULL,
            payload TEXT NOT NULL,
            qos INTEGER NOT NULL,
            retain INTEGER NOT NULL,
            direction INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_message_ts_id ON message_history(ts_ms DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_message_topic_ts ON message_history(topic, ts_ms DESC);
        ",
    )
    .context("failed to initialize history schema")?;
    Ok(())
}

fn row_to_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<HistoryMessageRecord> {
    let direction_val: i64 = row.get(6)?;
    Ok(HistoryMessageRecord {
        id: row.get(0)?,
        timestamp: row.get::<_, i64>(1)? as u64,
        topic: row.get(2)?,
        payload: row.get(3)?,
        qos: row.get::<_, i64>(4)? as u8,
        retain: row.get::<_, i64>(5)? == 1,
        direction: if direction_val == 1 {
            MessageDirection::Out
        } else {
            MessageDirection::In
        },
    })
}

fn direction_to_int(direction: MessageDirection) -> i64 {
    if matches!(direction, MessageDirection::Out) {
        1
    } else {
        0
    }
}

fn safe_connection_id(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len().max(12));
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    if out.is_empty() {
        "connection".to_string()
    } else {
        out
    }
}

fn deleting_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("history.db");
    path.with_file_name(format!("{file_name}.deleting.{}", now_millis()))
}

fn escape_csv(input: &str) -> String {
    let escaped = input.replace('"', "\"\"");
    format!("\"{escaped}\"")
}

fn normalize_output_path(path: PathBuf, ext: &str) -> PathBuf {
    let has_ext = path.extension().and_then(|v| v.to_str()).is_some();
    if has_ext {
        path
    } else {
        path.with_extension(ext)
    }
}

fn remove_sidecar_files(base_path: &Path) {
    let db_name = match base_path.file_name().and_then(|n| n.to_str()) {
        Some(name) => name,
        None => return,
    };
    let wal_path = base_path.with_file_name(format!("{db_name}-wal"));
    let shm_path = base_path.with_file_name(format!("{db_name}-shm"));

    let _ = fs::remove_file(wal_path);
    let _ = fs::remove_file(shm_path);
}
