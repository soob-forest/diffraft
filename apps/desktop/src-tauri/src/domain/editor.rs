use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::document::{DocumentSnapshot, VersionSummary};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskSnapshot {
    pub id: String,
    pub document_id: String,
    pub goal: String,
    pub pinned_rules: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Heading {
    pub title: String,
    pub level: u8,
    pub from: u32,
    pub to: u32,
    pub from_utf16: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceBlock {
    pub id: String,
    pub from: u32,
    pub to: u32,
    pub heading_path: Vec<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ScopeSelection {
    Whole,
    Selection { from: u32, to: u32 },
    Section { cursor: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScopeSnapshot {
    pub document_id: String,
    pub version_id: String,
    pub version: u32,
    pub content_hash: String,
    pub from: u32,
    pub to: u32,
    pub text: String,
    pub blocks: Vec<SourceBlock>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditorState {
    pub document: DocumentSnapshot,
    pub tasks: Vec<TaskSnapshot>,
    pub selected_task_id: Option<String>,
    pub versions: Vec<VersionSummary>,
    pub headings: Vec<Heading>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditorRequest {
    pub schema_version: u32,
    pub action: EditorAction,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum EditorAction {
    SelectDocument {
        document_id: String,
    },
    SelectTask {
        document_id: String,
        task_id: Option<String>,
    },
    CommonRules {
        document_id: String,
        rules: Option<String>,
    },
    Read {
        document_id: String,
    },
    Check {
        document_id: String,
    },
    Save {
        document_id: String,
        expected_version: u32,
        content: String,
        operation_id: String,
    },
    PutTask {
        task: TaskSnapshot,
    },
    Scope {
        document_id: String,
        expected_version: u32,
        selection: ScopeSelection,
    },
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum EditorReply {
    SelectedTask(Option<String>),
    Rules(String),
    State(EditorState),
    Document(DocumentSnapshot),
    Task(TaskSnapshot),
    Scope(ScopeSnapshot),
}
