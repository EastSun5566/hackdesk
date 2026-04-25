use std::time::Duration;

use reqwest::Client;
use serde::{Deserialize, Serialize};

const AGENT_API_KEY_ENV: &str = "HACKDESK_AGENT_API_KEY";
const AGENT_BASE_URL_ENV: &str = "HACKDESK_AGENT_BASE_URL";
const AGENT_MODEL_ENV: &str = "HACKDESK_AGENT_MODEL";
const DEFAULT_AGENT_BASE_URL: &str = "https://api.openai.com/v1";
const DEFAULT_AGENT_MODEL: &str = "gpt-5-nano";
const AGENT_HTTP_TIMEOUT_SECS: u64 = 45;
const MAX_LIVE_NOTE_CHARS: usize = 12_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentNoteContextInput {
    pub url: String,
    pub path: String,
    pub title: String,
    pub note_id: Option<String>,
    pub scope: String,
    pub team_path: Option<String>,
    pub is_note: bool,
    pub reason: Option<String>,
    pub content: Option<String>,
    pub content_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AgentRuntimeConfig {
    api_key: String,
    base_url: String,
    model: String,
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatCompletionMessage>,
}

#[derive(Debug, Serialize)]
struct ChatCompletionMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChoice {
    message: ChatCompletionResponseMessage,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponseMessage {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionErrorResponse {
    error: ChatCompletionErrorPayload,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionErrorPayload {
    message: Option<String>,
}

fn normalized_env_value(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
}

fn is_placeholder_secret(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();

    normalized.is_empty()
        || normalized.contains("your_")
        || normalized.contains("replace_me")
        || normalized.contains("placeholder")
}

fn load_runtime_config_from_values<F>(get_value: F) -> Option<AgentRuntimeConfig>
where
    F: Fn(&str) -> Option<String>,
{
    let api_key = normalized_env_value(get_value(AGENT_API_KEY_ENV))?;

    if is_placeholder_secret(&api_key) {
        return None;
    }

    let base_url = normalized_env_value(get_value(AGENT_BASE_URL_ENV))
        .unwrap_or_else(|| DEFAULT_AGENT_BASE_URL.to_string());
    let model = normalized_env_value(get_value(AGENT_MODEL_ENV))
        .unwrap_or_else(|| DEFAULT_AGENT_MODEL.to_string());

    Some(AgentRuntimeConfig {
        api_key,
        base_url,
        model,
    })
}

fn load_runtime_config() -> Option<AgentRuntimeConfig> {
    let _ = dotenvy::dotenv();

    load_runtime_config_from_values(|key| std::env::var(key).ok())
}

fn truncate_note_content(content: &str, max_chars: usize) -> String {
    if content.chars().count() <= max_chars {
        return content.to_string();
    }

    let truncated = content.chars().take(max_chars).collect::<String>();

    format!(
        "{}\n\n[truncated so the live model request stays within a practical context window]",
        truncated.trim_end()
    )
}

fn build_system_prompt(intent: Option<&str>) -> String {
    let intent_line = if intent == Some("summary") {
        "The user primarily wants a concise, structured summary of the note."
    } else {
        "The user is asking a note-focused question that should be answered using the note content."
    };

    format!(
        "You are HackDesk Note Agent. Answer only from the supplied HackMD note context. Stay read-only: do not claim to edit notes, run commands, or change HackMD state. If the note content is insufficient, say what is missing instead of inventing facts. Keep answers concise, clear, and useful. {}",
        intent_line,
    )
}

fn build_live_user_prompt(prompt: &str, context: &AgentNoteContextInput) -> String {
    let note_body = truncate_note_content(
        context.content.as_deref().unwrap_or_default(),
        MAX_LIVE_NOTE_CHARS,
    );

    format!(
        "Current note title: {}\nCurrent note path: {}\nCurrent note scope: {}\n\nUser request:\n{}\n\nCurrent note markdown:\n```markdown\n{}\n```",
        normalize_context_title(&context.title),
        context.path,
        context.scope,
        prompt.trim(),
        note_body,
    )
}

fn extract_chat_completion_content(response: ChatCompletionResponse) -> Result<String, String> {
    let content = response
        .choices
        .into_iter()
        .next()
        .and_then(|choice| choice.message.content)
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty());

    content.ok_or_else(|| {
        "HackDesk received an empty message from the configured live model.".to_string()
    })
}

fn extract_chat_completion_error(status_code: u16, body: &str) -> String {
    serde_json::from_str::<ChatCompletionErrorResponse>(body)
        .ok()
        .and_then(|payload| payload.error.message)
        .filter(|message| !message.trim().is_empty())
        .unwrap_or_else(|| {
            if body.trim().is_empty() {
                format!("The configured live model returned HTTP {}.", status_code)
            } else {
                format!(
                    "The configured live model returned HTTP {}: {}",
                    status_code,
                    body.trim()
                )
            }
        })
}

fn build_runtime_disabled_suffix() -> String {
    format!(
        "\n\n---\nHackDesk is still using the local note formatter. Add `{}` to `.env` to enable the OpenAI-compatible runtime.",
        AGENT_API_KEY_ENV,
    )
}

fn build_runtime_failure_suffix(error: &str) -> String {
    format!(
        "\n\n---\nHackDesk fell back to the local note formatter because the configured live model request failed: {}",
        error,
    )
}

fn validate_agent_request<'prompt, 'context>(
    prompt: &'prompt str,
    context: Option<&'context AgentNoteContextInput>,
) -> Result<(&'prompt str, &'context AgentNoteContextInput), String> {
    let normalized_prompt = prompt.trim();

    if normalized_prompt.is_empty() {
        return Err("Please enter a note-focused prompt first.".to_string());
    }

    let Some(context) = context else {
        return Err(
            "Open a HackMD note in the main window before using the note agent.".to_string(),
        );
    };

    if !context.is_note {
        return Err(context
            .reason
            .clone()
            .unwrap_or_else(|| "This page does not look like a HackMD note yet.".to_string()));
    }

    Ok((normalized_prompt, context))
}

async fn send_live_agent_message_with_config(
    prompt: &str,
    context: &AgentNoteContextInput,
    intent: Option<&str>,
    config: &AgentRuntimeConfig,
) -> Result<String, String> {
    let (normalized_prompt, validated_context) = validate_agent_request(prompt, Some(context))?;
    let endpoint = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
    let request_body = ChatCompletionRequest {
        model: config.model.clone(),
        messages: vec![
            ChatCompletionMessage {
                role: "system".to_string(),
                content: build_system_prompt(intent),
            },
            ChatCompletionMessage {
                role: "user".to_string(),
                content: build_live_user_prompt(normalized_prompt, validated_context),
            },
        ],
    };
    let client = Client::builder()
        .timeout(Duration::from_secs(AGENT_HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|error| {
            format!(
                "HackDesk could not initialize the configured live model client: {}",
                error
            )
        })?;
    let response = client
        .post(endpoint)
        .bearer_auth(&config.api_key)
        .json(&request_body)
        .send()
        .await
        .map_err(|error| {
            format!(
                "HackDesk could not reach the configured live model: {}",
                error
            )
        })?;
    let status = response.status();

    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(extract_chat_completion_error(status.as_u16(), &body));
    }

    let payload = response
        .json::<ChatCompletionResponse>()
        .await
        .map_err(|error| {
            format!(
                "HackDesk could not parse the configured live model response: {}",
                error
            )
        })?;

    extract_chat_completion_content(payload)
}

fn normalize_context_title(title: &str) -> String {
    title
        .trim()
        .trim_end_matches(" - HackMD")
        .trim()
        .to_string()
}

fn count_words(content: &str) -> usize {
    content.split_whitespace().count()
}

fn count_non_empty_lines(content: &str) -> usize {
    content
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count()
}

fn collect_headings(content: &str) -> Vec<String> {
    content
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with('#') {
                Some(trimmed.trim_start_matches('#').trim().to_string())
            } else {
                None
            }
        })
        .filter(|line| !line.is_empty())
        .take(3)
        .collect()
}

fn build_preview(content: &str) -> String {
    let preview_lines = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(3)
        .collect::<Vec<_>>();

    if preview_lines.is_empty() {
        "(The note body is currently empty.)".to_string()
    } else {
        preview_lines.join("\n")
    }
}

fn build_content_fallback_suffix(context: &AgentNoteContextInput) -> String {
    context
        .content_reason
        .as_deref()
        .map(|reason| {
            format!(
                "\n\nHackDesk could not load the full note markdown yet: {}",
                reason
            )
        })
        .unwrap_or_default()
}

pub fn send_mock_agent_message(
    prompt: &str,
    context: Option<AgentNoteContextInput>,
    intent: Option<&str>,
) -> Result<String, String> {
    let Some(context) = context else {
        return Err(
            "Open a HackMD note in the main window before using the note agent.".to_string(),
        );
    };
    let (normalized_prompt, _) = validate_agent_request(prompt, Some(&context))?;

    let title = normalize_context_title(&context.title);
    let content = context.content.as_deref();

    if let Some(content) = content {
        let word_count = count_words(content);
        let non_empty_lines = count_non_empty_lines(content);
        let headings = collect_headings(content);
        let preview = build_preview(content);
        let heading_summary = if headings.is_empty() {
            "No markdown headings are in the note yet.".to_string()
        } else {
            format!("Headings spotted: {}.", headings.join(" · "))
        };

        if intent == Some("summary")
            || normalized_prompt.eq_ignore_ascii_case("Summarize the current note.")
        {
            return Ok(format!(
                "Here’s a grounded summary for “{}”.\n\n- HackDesk loaded the current note markdown ({} words across {} non-empty lines).\n- {}\n- Preview:\n{}\n\nThis is still a read-only MVP response, but it is now grounded in the actual note body instead of only the route metadata.",
                title, word_count, non_empty_lines, heading_summary, preview
            ));
        }

        return Ok(format!(
            "You asked about “{}”.\n\nQuestion received: {}\n\nHackDesk loaded the current note markdown ({} words across {} non-empty lines). {}\n\nQuick preview:\n{}\n\nThis is still a read-only MVP, but the response is now grounded in the current note body rather than only the note route.",
            title,
            normalized_prompt,
            word_count,
            non_empty_lines,
            heading_summary,
            preview,
        ));
    }

    if intent == Some("summary")
        || normalized_prompt.eq_ignore_ascii_case("Summarize the current note.")
    {
        return Ok(format!(
            "Here’s a lightweight MVP summary for “{}”.\n\n- You launched from the note route `{}`.\n- This response is still falling back to note metadata because the full Markdown content is not loaded yet.\n- The note agent remains intentionally read-only.{}\n\nTry a follow-up like “what risks should I look for in this note?” or “turn this into a short status update.”",
            title,
            context.path,
            build_content_fallback_suffix(&context),
        ));
    }

    Ok(format!(
        "You asked about “{}”.\n\nQuestion received: {}\n\nThis first MVP already knows which HackMD note you launched from (`{}`), keeps the session local, and stays safely read-only. It is currently falling back to note metadata instead of the full note body.{}",
        title,
        normalized_prompt,
        context.path,
        build_content_fallback_suffix(&context),
    ))
}

pub async fn send_agent_message(
    prompt: &str,
    context: Option<AgentNoteContextInput>,
    intent: Option<&str>,
) -> Result<String, String> {
    let should_attempt_live = context
        .as_ref()
        .map(|context| context.is_note && context.content.as_deref().is_some())
        .unwrap_or(false);

    if !should_attempt_live {
        return send_mock_agent_message(prompt, context, intent);
    }

    if let Some(config) = load_runtime_config() {
        let live_result = {
            let live_context = context
                .as_ref()
                .expect("live runtime path requires an agent context");

            send_live_agent_message_with_config(prompt, live_context, intent, &config).await
        };

        return match live_result {
            Ok(response) => Ok(response),
            Err(error) => {
                let fallback = send_mock_agent_message(prompt, context, intent)?;
                Ok(format!(
                    "{}{}",
                    fallback,
                    build_runtime_failure_suffix(&error)
                ))
            }
        };
    }

    let fallback = send_mock_agent_message(prompt, context, intent)?;
    Ok(format!("{}{}", fallback, build_runtime_disabled_suffix()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn build_context(content: Option<&str>, content_reason: Option<&str>) -> AgentNoteContextInput {
        AgentNoteContextInput {
            url: "https://hackmd.io/@michael/roadmap".to_string(),
            path: "/@michael/roadmap".to_string(),
            title: "Roadmap - HackMD".to_string(),
            note_id: Some("roadmap".to_string()),
            scope: "personal-or-team".to_string(),
            team_path: Some("michael".to_string()),
            is_note: true,
            reason: None,
            content: content.map(str::to_string),
            content_reason: content_reason.map(str::to_string),
        }
    }

    #[test]
    fn summary_uses_loaded_note_content_when_available() {
        let response = send_mock_agent_message(
            "Summarize the current note.",
            Some(build_context(
                Some("# Roadmap\n\n## Risks\n- API drift\n- Scope creep"),
                None,
            )),
            Some("summary"),
        )
        .unwrap();

        assert!(response.contains("current note markdown"));
        assert!(response.contains("Risks"));
        assert!(response.contains("API drift"));
    }

    #[test]
    fn metadata_fallback_mentions_missing_content_reason() {
        let response = send_mock_agent_message(
            "What are the key ideas?",
            Some(build_context(
                None,
                Some("HackMD API token is not configured."),
            )),
            Some("ask"),
        )
        .unwrap();

        assert!(response.contains("falling back to note metadata"));
        assert!(response.contains("HackMD API token is not configured."));
    }

    #[test]
    fn runtime_config_skips_placeholder_api_keys() {
        let vars = HashMap::from([
            (AGENT_API_KEY_ENV, "your_openai_api_key_here".to_string()),
            (AGENT_MODEL_ENV, "gpt-5-nano".to_string()),
        ]);

        let config = load_runtime_config_from_values(|key| vars.get(key).cloned());

        assert!(config.is_none());
    }

    #[test]
    fn runtime_config_uses_defaults_for_optional_values() {
        let vars = HashMap::from([(AGENT_API_KEY_ENV, "sk-test-key".to_string())]);

        let config = load_runtime_config_from_values(|key| vars.get(key).cloned()).unwrap();

        assert_eq!(config.base_url, DEFAULT_AGENT_BASE_URL);
        assert_eq!(config.model, DEFAULT_AGENT_MODEL);
    }

    #[test]
    fn extracts_first_chat_completion_message() {
        let response = ChatCompletionResponse {
            choices: vec![ChatCompletionChoice {
                message: ChatCompletionResponseMessage {
                    content: Some("  Hello from a live model.  ".to_string()),
                },
            }],
        };

        assert_eq!(
            extract_chat_completion_content(response).unwrap(),
            "Hello from a live model."
        );
    }
}
