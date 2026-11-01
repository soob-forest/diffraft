use super::{
    error::AppError,
    provider::{ProviderModel, ReasoningEffort},
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodexModelInfo {
    pub model: String,
    pub label: String,
    pub is_default: bool,
    pub effort: ReasoningEffort,
    pub supported_efforts: Vec<ReasoningEffort>,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodexReport {
    pub executable: String,
    pub version: String,
    pub account_scope: String,
    pub models: Vec<CodexModelInfo>,
    pub tested_model: Option<ProviderModel>,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum CodexAction {
    Inspect,
    Test,
    Login,
}
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CodexRequest {
    pub schema_version: u32,
    pub operation_id: String,
    pub action: CodexAction,
}
impl CodexRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        super::ipc::SnapshotRequest {
            schema_version: self.schema_version,
        }
        .validate()?;
        super::document::validate_id(&self.operation_id)
    }
}
