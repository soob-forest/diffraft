use super::{
    error::AppError,
    provider::{AiProvider, ProviderModel},
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiPreferences {
    pub provider: AiProvider,
    pub codex_model: Option<ProviderModel>,
    pub codex_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum AiSettingsAction {
    Read,
    Provider { provider: AiProvider },
    Model { model: Option<ProviderModel> },
    CodexPath { path: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiSettingsRequest {
    pub schema_version: u32,
    pub action: AiSettingsAction,
}

pub fn validate_path(path: &str) -> Result<(), AppError> {
    if path.is_empty()
        || path.len() > 4096
        || path.chars().any(char::is_control)
        || !std::path::Path::new(path).is_absolute()
    {
        return Err(AppError::invalid(
            "Codex 실행 파일은 올바른 절대 경로여야 합니다.",
        ));
    }
    Ok(())
}
