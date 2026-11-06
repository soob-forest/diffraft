use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(
    tag = "kind",
    content = "value",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum SavedGenerationRequest {
    Selection(Box<super::selection_request::SelectionRequest>),
    Generate(Box<super::generation::GenerateRequest>),
    Regenerate(Box<super::regeneration::RegenerateRequest>),
    Rewrite(Box<super::rewrite::RewriteRequest>),
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerationAttempt {
    pub job_id: String,
    pub attempt_id: String,
    pub status: String,
    pub error_code: Option<super::error::ErrorCode>,
    pub request: SavedGenerationRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConversationMessage {
    pub id: String,
    pub sequence: u32,
    pub role: String,
    pub content: String,
    #[ts(type = "number")]
    pub created_at: i64,
    pub job_id: Option<String>,
    #[serde(default)]
    pub result: Option<ConversationResult>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub question: Option<super::change_question::ChangeQuestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConversationResult {
    pub batch_id: String,
    pub proposal_id: Option<String>,
    pub revision: Option<u32>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TaskSessionState {
    Local,
    Connected,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskConversation {
    pub task_id: String,
    pub messages: Vec<ConversationMessage>,
    pub earlier_before: Option<u32>,
    pub session: TaskSessionState,
    pub last_attempt: Option<GenerationAttempt>,
    pub common_rules: String,
}
