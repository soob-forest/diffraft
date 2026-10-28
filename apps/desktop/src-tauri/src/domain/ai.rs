use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::error::{AppError, ErrorCode};
use super::{MAX_DOCUMENT_BYTES, MAX_RESPONSE_BYTES, SCHEMA_VERSION};

pub const MAX_CHANGES: usize = 256;
pub const MAX_DESCRIPTION_BYTES: usize = 4096;
pub const MAX_ANSWER_BYTES: usize = 64 * 1024;
pub const MAX_BLOCK_ID_BYTES: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ResponseMode {
    Patch,
    Rewrite,
    Explain,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(deny_unknown_fields)]
pub struct AiChange {
    #[schemars(length(min = 1, max = 64), regex(pattern = "^[A-Za-z0-9_-]+$"))]
    pub block_id: String,
    #[schemars(length(max = 1048576))]
    pub before: String,
    #[schemars(length(max = 1048576))]
    pub after: String,
    #[schemars(length(max = 4096))]
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "mode", rename_all = "SCREAMING_SNAKE_CASE", deny_unknown_fields)]
pub enum AiResponse {
    Patch {
        #[schemars(range(min = 1, max = 1))]
        schema_version: u32,
        #[schemars(length(max = 4096))]
        summary: String,
        #[schemars(length(max = 256))]
        changes: Vec<AiChange>,
    },
    Rewrite {
        #[schemars(range(min = 1, max = 1))]
        schema_version: u32,
        #[schemars(length(max = 4096))]
        summary: String,
        #[schemars(length(max = 1048576))]
        candidate_markdown: String,
    },
    Explain {
        #[schemars(range(min = 1, max = 1))]
        schema_version: u32,
        #[schemars(length(max = 65536))]
        answer: String,
    },
}

fn invalid_output() -> AppError {
    AppError::new(
        ErrorCode::OutputInvalid,
        "AI 응답 형식 또는 크기가 올바르지 않습니다.",
    )
}

impl AiChange {
    fn valid(&self) -> bool {
        !self.block_id.is_empty()
            && self.block_id.len() <= MAX_BLOCK_ID_BYTES
            && self
                .block_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            && self.before.len() <= MAX_DOCUMENT_BYTES
            && self.after.len() <= MAX_DOCUMENT_BYTES
            && self.reason.len() <= MAX_DESCRIPTION_BYTES
    }
}

impl AiResponse {
    pub fn parse(bytes: &[u8]) -> Result<Self, AppError> {
        if bytes.len() > MAX_RESPONSE_BYTES {
            return Err(invalid_output());
        }
        let response: Self = serde_json::from_slice(bytes).map_err(|_| invalid_output())?;
        response.validate()?;
        Ok(response)
    }

    pub fn validate(&self) -> Result<(), AppError> {
        if self.schema_version() != SCHEMA_VERSION {
            return Err(invalid_output());
        }
        let valid = match self {
            Self::Patch {
                summary, changes, ..
            } => {
                summary.len() <= MAX_DESCRIPTION_BYTES
                    && changes.len() <= MAX_CHANGES
                    && changes.iter().all(AiChange::valid)
            }
            Self::Rewrite {
                summary,
                candidate_markdown,
                ..
            } => {
                summary.len() <= MAX_DESCRIPTION_BYTES
                    && candidate_markdown.len() <= MAX_DOCUMENT_BYTES
            }
            Self::Explain { answer, .. } => answer.len() <= MAX_ANSWER_BYTES,
        };
        if valid { Ok(()) } else { Err(invalid_output()) }
    }

    fn schema_version(&self) -> u32 {
        match self {
            Self::Patch { schema_version, .. }
            | Self::Rewrite { schema_version, .. }
            | Self::Explain { schema_version, .. } => *schema_version,
        }
    }
}
