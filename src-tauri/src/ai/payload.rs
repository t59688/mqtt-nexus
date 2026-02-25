use crate::models::AiConfig;
use anyhow::{Context, Result, anyhow};
use rig::completion::Prompt;
use rig::prelude::CompletionClient;
use rig::providers::openai;

pub async fn generate_payload(
    topic: &str,
    description: &str,
    defaults: &AiConfig,
    options: &Option<AiConfig>,
) -> Result<String> {
    let merged = merge_config(defaults, options);

    let topic = topic.trim();
    if topic.is_empty() {
        return Err(anyhow!("Topic is required for AI generation"));
    }

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
        .ok_or_else(|| anyhow!("AI base URL is missing"))?;
    validate_base_url(base_url)?;

    let model = merged
        .model
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("AI model is missing"))?;

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

    let normalized = normalize_response_to_json(&response)?;
    Ok(serde_json::to_string_pretty(&normalized).context("failed to serialize AI JSON output")?)
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

fn validate_base_url(value: &str) -> Result<()> {
    if value.starts_with("http://") || value.starts_with("https://") {
        return Ok(());
    }
    Err(anyhow!("AI base URL must start with http:// or https://"))
}

fn normalize_response_to_json(raw: &str) -> Result<serde_json::Value> {
    let cleaned = strip_markdown_fences(raw);
    if cleaned.is_empty() {
        return Err(anyhow!("AI returned an empty payload"));
    }

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&cleaned) {
        return Ok(parsed);
    }

    let candidate = extract_json_candidate(&cleaned)
        .ok_or_else(|| anyhow!("AI output does not contain a valid JSON object or array"))?;
    serde_json::from_str::<serde_json::Value>(&candidate)
        .context("AI output contains malformed JSON")
}

fn extract_json_candidate(raw: &str) -> Option<String> {
    let chars: Vec<char> = raw.chars().collect();
    let mut start_idx: Option<usize> = None;
    let mut open_brace: i32 = 0;
    let mut open_bracket: i32 = 0;
    let mut in_string = false;
    let mut escaped = false;

    for (idx, ch) in chars.iter().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }
            if *ch == '\\' {
                escaped = true;
                continue;
            }
            if *ch == '"' {
                in_string = false;
            }
            continue;
        }

        if *ch == '"' {
            in_string = true;
            continue;
        }

        if start_idx.is_none() {
            if *ch == '{' || *ch == '[' {
                start_idx = Some(idx);
                if *ch == '{' {
                    open_brace = 1;
                } else {
                    open_bracket = 1;
                }
            }
            continue;
        }

        match *ch {
            '{' => open_brace += 1,
            '}' => open_brace -= 1,
            '[' => open_bracket += 1,
            ']' => open_bracket -= 1,
            _ => {}
        }

        if open_brace == 0 && open_bracket == 0 {
            let start = start_idx?;
            return Some(chars[start..=idx].iter().collect::<String>());
        }
    }

    None
}
