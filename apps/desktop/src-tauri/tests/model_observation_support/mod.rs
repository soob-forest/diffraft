use docreview_core::{
    claude_adapter::{
        connection, guarded_process, process::ProcessSpec, process_lease, result, settings,
    },
    domain::{
        MAX_RESPONSE_BYTES,
        ai::ResponseMode,
        error::{AppError, ErrorCode},
        model::ModelSelection,
    },
};
use serde::Serialize;
use serde_json::Value;
use std::{
    path::PathBuf,
    sync::{Arc, atomic::AtomicBool},
    time::Instant,
};

pub const RETIRED_MODEL: &str = "claude-3-7-sonnet-20250219";
const FALLBACK_MODEL: &str = "haiku";
const MAX_MODEL_NAME_BYTES: usize = 128;
const MAX_USAGE_MODELS: usize = 16;
const INPUT: &[u8] = br#"{"mode":"EXPLAIN","instruction":"Return the single word CONNECTED. No document is provided."}"#;

#[derive(Serialize)]
pub struct UsageModel {
    pub name: String,
    pub canonical: Option<String>,
    pub output_tokens: u64,
}

#[derive(Serialize)]
pub struct Observation {
    pub success: bool,
    pub error_code: Option<ErrorCode>,
    pub unavailable: bool,
    pub models: Vec<UsageModel>,
}

pub struct Probe {
    directory: tempfile::TempDir,
    spec: ProcessSpec,
    version: String,
    requested: ModelSelection,
    retired: bool,
    fallback: bool,
}

fn checked<T>(value: Result<T, AppError>) -> T {
    value.unwrap_or_else(|error| panic!("observation_error={:?}", error.code))
}

impl Probe {
    pub fn new(model: ModelSelection) -> Self {
        let cli = PathBuf::from(
            std::env::var_os("DOCREVIEW_TEST_CLI").expect("explicit DOCREVIEW_TEST_CLI required"),
        );
        assert!(cli.is_absolute(), "DOCREVIEW_TEST_CLI must be absolute");
        let directory = tempfile::tempdir().unwrap();
        checked(settings::save(directory.path(), &cli));
        let prepared = checked(connection::prepared(
            directory.path(),
            &uuid::Uuid::new_v4().to_string(),
            ResponseMode::Explain,
            None,
            model,
        ));
        Self {
            directory,
            spec: prepared.spec,
            version: prepared.version,
            requested: model,
            retired: false,
            fallback: false,
        }
    }

    pub fn use_retired_model(&mut self, fallback: bool) {
        let index = self
            .spec
            .args
            .iter()
            .position(|arg| arg == "--model")
            .expect("explicit primary model argument");
        self.spec.args[index + 1] = RETIRED_MODEL.into();
        self.retired = true;
        self.fallback = fallback;
        if fallback {
            self.spec
                .args
                .extend(["--fallback-model".into(), FALLBACK_MODEL.into()]);
        }
    }

    pub fn run(&self) -> Observation {
        let started = Instant::now();
        let output = checked(guarded_process::run(
            &self.spec,
            INPUT,
            Arc::new(AtomicBool::new(false)),
            self.directory.path(),
        ));
        checked(process_lease::require_clear(self.directory.path()));
        let validated = result::completion(&output);
        let observed = observe(
            &output.stdout,
            validated.as_ref().err().map(|error| error.code),
        )
        .unwrap_or_else(|error| panic!("{error}"));
        println!(
            "{}",
            serde_json::json!({
                "cli_version": self.version,
                "requested_model": self.requested,
                "primary_override": self.retired.then_some(RETIRED_MODEL),
                "explicit_fallback": self.fallback.then_some(FALLBACK_MODEL),
                "elapsed_ms": started.elapsed().as_millis(),
                "exit_code": output.status.code(),
                "observation": observed,
            })
        );
        observed
    }
}

fn identifier(value: &str) -> Result<String, &'static str> {
    if !value.starts_with("claude-")
        || value.len() > MAX_MODEL_NAME_BYTES
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || b"-.".contains(&byte))
    {
        return Err("invalid response model identifier; raw value omitted");
    }
    Ok(value.into())
}

fn models(value: &Value) -> Result<Vec<UsageModel>, &'static str> {
    let Some(usage) = value.get("modelUsage") else {
        return Ok(Vec::new());
    };
    let usage = usage.as_object().ok_or("invalid modelUsage object")?;
    if usage.len() > MAX_USAGE_MODELS {
        return Err("too many modelUsage entries");
    }
    usage
        .iter()
        .map(|(name, entry)| {
            Ok(UsageModel {
                name: identifier(name)?,
                canonical: entry
                    .get("canonicalModel")
                    .map(|value| identifier(value.as_str().ok_or("invalid canonical model type")?))
                    .transpose()?,
                output_tokens: entry["outputTokens"]
                    .as_u64()
                    .ok_or("invalid output token count")?,
            })
        })
        .collect()
}

fn observe(stdout: &[u8], error_code: Option<ErrorCode>) -> Result<Observation, &'static str> {
    if stdout.len() > MAX_RESPONSE_BYTES {
        return Err("observation output exceeded size limit");
    }
    let value: Value =
        serde_json::from_slice(stdout).map_err(|_| "invalid CLI JSON; raw output omitted")?;
    let unavailable =
        error_code.is_some() && value["is_error"] == true && unavailable_error(&value);
    Ok(Observation {
        success: error_code.is_none(),
        error_code,
        unavailable,
        models: models(&value)?,
    })
}

fn unavailable_error(value: &Value) -> bool {
    value["errors"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .chain(value["result"].as_str())
        .any(|message| {
            let lower = message.to_ascii_lowercase();
            lower.contains("model")
                && (lower.contains("not found")
                    || lower.contains("not available")
                    || lower.contains("not exist")
                    || lower.contains("selected model"))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn observation_excludes_response_errors_session_and_account_fields() {
        let value = serde_json::json!({"result":"private-response", "session_id":"private-session",
            "account":"private-account", "errors":["private-diagnostic"],
            "modelUsage":{"claude-haiku-4-5":{"outputTokens":2, "canonicalModel":"claude-haiku-4-5", "private":"secret"}}});
        let observed = observe(&serde_json::to_vec(&value).unwrap(), None).unwrap();
        let encoded = serde_json::to_string(&observed).unwrap();
        assert!(!encoded.contains("private") && !encoded.contains("secret"));
        assert_eq!(observed.models.len(), 1);
    }

    #[test]
    fn invalid_or_excessive_model_metadata_is_rejected_without_echoing_values() {
        for name in [
            "secret-token",
            "claude-x\nprivate",
            "claude-../../../private",
            &"claude-x".repeat(MAX_MODEL_NAME_BYTES),
        ] {
            assert!(identifier(name).is_err());
        }
        assert!(models(&serde_json::json!({"modelUsage":[]})).is_err());
        assert!(
            models(&serde_json::json!({"modelUsage":{"claude-x":{"outputTokens":-1}}})).is_err()
        );
        let usage: serde_json::Map<String, Value> = (0..=MAX_USAGE_MODELS)
            .map(|index| {
                (
                    format!("claude-model-{index}"),
                    serde_json::json!({"outputTokens":0}),
                )
            })
            .collect();
        assert!(models(&serde_json::json!({"modelUsage":usage})).is_err());
        assert!(observe(&vec![b'x'; MAX_RESPONSE_BYTES + 1], None).is_err());
    }

    #[test]
    fn successful_answer_text_cannot_become_a_model_availability_error() {
        let value =
            serde_json::json!({"result":"The selected model is not available is an example"});
        let observed = observe(&serde_json::to_vec(&value).unwrap(), None).unwrap();
        assert!(!observed.unavailable);
    }

    #[test]
    fn only_failed_error_envelopes_report_model_unavailability() {
        let mut value = serde_json::json!({"is_error":true,
            "errors":["The selected model does not exist or is not available."]});
        let bytes = serde_json::to_vec(&value).unwrap();
        let failed = observe(&bytes, Some(ErrorCode::UnknownError)).unwrap();
        assert!(failed.unavailable && !failed.success && failed.models.is_empty());
        value["is_error"] = false.into();
        let bytes = serde_json::to_vec(&value).unwrap();
        assert!(
            !observe(&bytes, Some(ErrorCode::UnknownError))
                .unwrap()
                .unavailable
        );
    }
}
