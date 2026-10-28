use super::{
    document::{DocumentSnapshot, validate_id},
    error::AppError,
    ipc::SnapshotRequest,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

const MAX_PATH_BYTES: usize = 4096;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportRequest {
    pub schema_version: u32,
    pub document_id: String,
    pub expected_head_id: String,
    pub expected_path: String,
}

impl ExportRequest {
    pub fn validate(&self) -> Result<(), AppError> {
        SnapshotRequest {
            schema_version: self.schema_version,
        }
        .validate()?;
        validate_id(&self.document_id)?;
        validate_id(&self.expected_head_id)?;
        if self.expected_path.is_empty()
            || self.expected_path.contains('\0')
            || self.expected_path.len() > MAX_PATH_BYTES
        {
            return Err(AppError::invalid("현재 작업 파일 경로를 확인해 주세요."));
        }
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportSnapshot {
    pub document: DocumentSnapshot,
    pub pending_groups: u32,
    pub pending_rewrites: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum ExportFileKind {
    Copy,
    WorkingFile,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportFileRequest {
    pub snapshot: ExportRequest,
    pub kind: ExportFileKind,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportSaved {
    pub document: DocumentSnapshot,
    pub path: String,
}
