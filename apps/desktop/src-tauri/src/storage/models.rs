use crate::domain::document::DocumentSnapshot;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SaveRequest {
    pub document_id: String,
    pub expected_version: u32,
    pub content: String,
    pub operation_id: String,
    pub reason: SaveReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SaveReason {
    Edit,
    Accept,
    Rewrite,
    Restore,
    External,
    Merge,
}

impl SaveReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Edit => "edit",
            Self::Accept => "accept",
            Self::Rewrite => "rewrite",
            Self::Restore => "restore",
            Self::External => "external",
            Self::Merge => "merge",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SaveRecord {
    pub request: SaveRequest,
    pub previous: DocumentSnapshot,
    pub version_id: String,
    pub event_id: String,
    pub new_hash: String,
    pub created_at: i64,
    #[serde(default)]
    pub effects: SaveEffects,
}

impl SaveRecord {
    pub fn disk_base_hash(&self) -> &str {
        match &self.effects {
            SaveEffects::Resolve { request } => &request.expected_disk_hash,
            _ => &self.previous.content_hash,
        }
    }

    pub fn replaces_file(&self) -> bool {
        !matches!(&self.effects, SaveEffects::Resolve { request }
            if request.choice == crate::domain::conflict::ResolutionChoice::External)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub(crate) enum SaveEffects {
    #[default]
    None,
    Restore {
        request: crate::domain::history::RestoreRequest,
    },
    Rewrite {
        request: crate::domain::rewrite::BatchDecisionRequest,
    },
    Accept {
        request: crate::domain::review::DecisionRequest,
    },
    Resolve {
        request: crate::domain::conflict::ResolutionRequest,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SaveStage {
    TempWritten,
    Prepared,
    BeforeReplace,
    FileReplaced,
    DbCommitted,
}

#[cfg(feature = "test-support")]
pub type SaveObserver =
    std::sync::Arc<dyn Fn(SaveStage) -> Result<(), crate::domain::error::AppError> + Send + Sync>;
