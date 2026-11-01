use super::policy;
use crate::domain::error::AppError;
use serde_json::{Value, json};
use std::{ffi::OsString, path::Path};

const BASE_INSTRUCTIONS: &str = "You are DocReview, an assistant for user-supplied Markdown. Use only the supplied request context. Do not read files, execute commands, use tools, or contact external services. Follow the developer instructions and requested JSON output schema. Changes are proposals for explicit user approval.";

pub struct RestrictedProfile {
    pub name: String,
    pub config: Value,
}

impl RestrictedProfile {
    pub fn new(config: &Value, directory: &Path) -> Result<Self, AppError> {
        if !directory.is_absolute() || !directory.is_dir() {
            return Err(AppError::invalid("Codex 전용 작업 폴더가 필요합니다."));
        }
        let name = format!("docreview-{}", uuid::Uuid::new_v4());
        if !config["permissions"][&name].is_null() {
            return Err(AppError::invalid("Codex 실행 제한 이름이 중복되었습니다."));
        }
        let mut config = policy::restrictions(config)?;
        config["permissions"] = json!({name.clone():{"filesystem":{
            ":minimal":"read",directory.to_string_lossy().as_ref():"read"},
            "network":{"enabled":false}}});
        Ok(Self { name, config })
    }

    pub fn thread_params(&self, directory: &Path, model: &str) -> Value {
        json!({"model":model,"modelProvider":"openai","cwd":directory,
            "baseInstructions":BASE_INSTRUCTIONS,
            "approvalPolicy":"never","permissions":self.name,
            "config":self.config,"dynamicTools":[],"environments":[],
            "runtimeWorkspaceRoots":[],"allowProviderModelFallback":false})
    }
}

/// JSON object keys are encoded as TOML table keys inside values, never interpolated as paths.
pub fn arguments(overrides: Option<&Value>) -> Result<Vec<OsString>, AppError> {
    let mut args: Vec<OsString> = ["app-server", "--stdio"].map(Into::into).into();
    let config = match overrides {
        Some(config) => config.clone(),
        None => policy::restrictions(&json!({}))?,
    };
    for (key, value) in config.as_object().ok_or_else(invalid)? {
        if !key.bytes().all(|b| b.is_ascii_lowercase() || b == b'_') {
            return Err(invalid());
        }
        args.extend(["-c".into(), format!("{key}={}", toml_value(value)?).into()]);
    }
    Ok(args)
}

fn toml_value(value: &Value) -> Result<String, AppError> {
    if let Some(object) = value.as_object() {
        let fields: Result<Vec<_>, AppError> = object
            .iter()
            .map(|(key, value)| {
                Ok(format!(
                    "{}={}",
                    serde_json::to_string(key).map_err(|_| invalid())?,
                    toml_value(value)?
                ))
            })
            .collect();
        Ok(format!("{{{}}}", fields?.join(",")))
    } else if value.is_null() {
        Err(invalid())
    } else {
        Ok(value.to_string())
    }
}

fn invalid() -> AppError {
    AppError::invalid("Codex 실행 제한 설정이 올바르지 않습니다.")
}
