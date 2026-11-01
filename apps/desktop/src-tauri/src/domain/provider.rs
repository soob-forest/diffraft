use super::{error::AppError, model::ModelSelection};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const MAX_PROVIDER_ID_BYTES: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum AiProvider {
    Claude,
    Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningEffort {
    None,
    Minimal,
    Low,
    Medium,
    High,
    Xhigh,
    Max,
    Ultra,
}

/// A resolved request choice. An offline Codex default must be resolved before confirmation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "provider", rename_all = "snake_case", deny_unknown_fields)]
pub enum ProviderModel {
    Claude {
        model: ModelSelection,
    },
    Codex {
        model: String,
        effort: ReasoningEffort,
    },
}

impl ProviderModel {
    pub fn provider(&self) -> AiProvider {
        match self {
            Self::Claude { .. } => AiProvider::Claude,
            Self::Codex { .. } => AiProvider::Codex,
        }
    }

    pub fn validate(&self) -> Result<(), AppError> {
        match self {
            Self::Claude { .. } => Ok(()),
            Self::Codex { model, .. } => validate_provider_id(model),
        }
    }

    pub fn claude(&self) -> Result<ModelSelection, AppError> {
        match self {
            Self::Claude { model } => Ok(*model),
            Self::Codex { .. } => Err(AppError::invalid(
                "Codex 요청을 Claude로 실행할 수 없습니다.",
            )),
        }
    }
}

impl Default for ProviderModel {
    fn default() -> Self {
        ModelSelection::default().into()
    }
}

impl From<ModelSelection> for ProviderModel {
    fn from(model: ModelSelection) -> Self {
        Self::Claude { model }
    }
}

/// Legacy request strings are read as Claude, without rewriting stored request JSON.
pub fn request_model<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<ProviderModel, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    decode_request_model(value).map_err(serde::de::Error::custom)
}

pub fn decode_request_model(value: serde_json::Value) -> Result<ProviderModel, serde_json::Error> {
    if value.is_string() {
        serde_json::from_value::<ModelSelection>(value).map(Into::into)
    } else {
        serde_json::from_value(value)
    }
}

pub fn validate_provider_id(value: &str) -> Result<(), AppError> {
    if value.is_empty()
        || value.len() > MAX_PROVIDER_ID_BYTES
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
        || !value.as_bytes()[0].is_ascii_alphanumeric()
    {
        return Err(AppError::invalid(
            "공급자 모델 또는 세션 식별자가 올바르지 않습니다.",
        ));
    }
    Ok(())
}
