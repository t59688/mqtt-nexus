use crate::models::{AppConfigPaths, NativeAppConfig};
use crate::mqtt::now_millis;
use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

const CONFIG_FILE_NAME: &str = "app-config.json";

fn config_dir_path(app: &AppHandle) -> Result<PathBuf> {
    let config_dir = app
        .path()
        .app_config_dir()
        .context("failed to resolve app config directory")?;

    fs::create_dir_all(&config_dir).with_context(|| {
        format!(
            "failed to create config directory: {}",
            config_dir.display()
        )
    })?;

    Ok(config_dir)
}

fn config_file_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(config_dir_path(app)?.join(CONFIG_FILE_NAME))
}

pub fn app_config_paths(app: &AppHandle) -> Result<AppConfigPaths> {
    let config_dir = config_dir_path(app)?;
    let config_file = config_dir.join(CONFIG_FILE_NAME);
    Ok(AppConfigPaths {
        config_dir: config_dir.display().to_string(),
        config_file: config_file.display().to_string(),
    })
}

pub fn open_config_dir(app: &AppHandle) -> Result<()> {
    let config_dir = config_dir_path(app)?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(config_dir.as_os_str())
            .spawn()
            .context("failed to open config directory in explorer")?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(config_dir.as_os_str())
            .spawn()
            .context("failed to open config directory in Finder")?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(config_dir.as_os_str())
            .spawn()
            .context("failed to open config directory with xdg-open")?;
    }

    Ok(())
}

pub fn load_config(app: &AppHandle) -> Result<NativeAppConfig> {
    let path = config_file_path(app)?;
    if !path.exists() {
        return Ok(NativeAppConfig::default());
    }

    let contents =
        fs::read_to_string(&path).with_context(|| format!("failed to read {}", path.display()))?;
    if contents.trim().is_empty() {
        return Ok(NativeAppConfig::default());
    }

    serde_json::from_str::<NativeAppConfig>(&contents)
        .with_context(|| format!("failed to parse {}", path.display()))
}

pub fn save_config(app: &AppHandle, config: &NativeAppConfig) -> Result<()> {
    let path = config_file_path(app)?;
    let temp_path = path.with_extension("json.tmp");

    let mut to_save = config.clone();
    to_save.updated_at = Some(now_millis());

    let content = serde_json::to_string_pretty(&to_save).context("failed to serialize config")?;
    fs::write(&temp_path, content.as_bytes())
        .with_context(|| format!("failed to write {}", temp_path.display()))?;

    if path.exists() {
        fs::remove_file(&path).with_context(|| format!("failed to replace {}", path.display()))?;
    }

    fs::rename(&temp_path, &path).with_context(|| {
        format!(
            "failed to rename {} to {}",
            temp_path.display(),
            path.display()
        )
    })?;

    Ok(())
}
