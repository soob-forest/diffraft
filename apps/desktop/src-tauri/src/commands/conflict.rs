use crate::{
    domain::{
        conflict_api::{ConflictAction, ConflictReply, ConflictRequest},
        error::AppError,
        ipc::SnapshotRequest,
    },
    storage::Store,
};

pub fn dispatch(store: &Store, request: ConflictRequest) -> Result<ConflictReply, AppError> {
    SnapshotRequest {
        schema_version: request.schema_version,
    }
    .validate()?;
    match request.action {
        ConflictAction::Compare {
            document_id,
            app_content,
        } => store
            .conflict_comparison(&document_id, &app_content)
            .map(ConflictReply::Comparison),
        ConflictAction::Resolve { resolution } => store
            .resolve_conflict(resolution)
            .map(ConflictReply::Document),
        ConflictAction::Recover { document_id } => {
            crate::domain::document::validate_id(&document_id)?;
            store.recover()?;
            store.snapshot(&document_id).map(ConflictReply::Document)
        }
        ConflictAction::RecoveryCopy {
            document_id,
            id,
            source,
        } => store
            .recovery_copy(&document_id, &id, source)
            .map(ConflictReply::Content),
    }
}
