use crate::models::AiConfig;
use anyhow::{anyhow, Context, Result};
use rig::completion::Prompt;
use rig::prelude::CompletionClient;
use rig::providers::openai;

const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_MODEL: &str = "gpt-4o-mini";

pub async fn generate_payload(
    topic: &str,
    description: &str,
    defaults: &AiConfig,
    options: &Option<AiConfig>,
) -> Result<String> {
    let merged = merge_config(defaults, options);

    let api_key = merged
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("AI API key is missing"))?;

    let base_url = merged
        .base_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_BASE_URL);

    let model = merged
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_MODEL);

    let prompt = format!(
        "You are an MQTT payload generator. Topic: \"{topic}\". Description: \"{description}\". Return only valid JSON with no markdown fences."
    );

    let client = openai::Client::builder()
        .api_key(api_key)
        .base_url(base_url)
        .build()
        .context("failed to build OpenAI-compatible client")?;

    let agent = client
        .completion_model(model)
        .completions_api()
        .into_agent_builder()
        .preamble("You generate realistic MQTT payloads and return strict JSON only.")
        .build();

    let response = agent
        .prompt(&prompt)
        .await
        .context("AI generation request failed")?;

    Ok(strip_markdown_fences(&response))
}

fn merge_config(defaults: &AiConfig, options: &Option<AiConfig>) -> AiConfig {
    match options {
        Some(opts) => AiConfig {
            base_url: opts.base_url.clone().or_else(|| defaults.base_url.clone()),
            api_key: opts.api_key.clone().or_else(|| defaults.api_key.clone()),
            model: opts.model.clone().or_else(|| defaults.model.clone()),
        },
        None => defaults.clone(),
    }
}

fn strip_markdown_fences(raw: &str) -> String {
    raw.replace("```json", "")
        .replace("```", "")
        .trim()
        .to_string()
}
