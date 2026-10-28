use crate::{
    domain::{
        error::AppError,
        history::{HistoryAction, HistoryReply, HistoryRequest},
        ipc::SnapshotRequest,
    },
    storage::Store,
};

pub fn dispatch(store: &Store, request: HistoryRequest) -> Result<HistoryReply, AppError> {
    SnapshotRequest {
        schema_version: request.schema_version,
    }
    .validate()?;
    match request.action {
        HistoryAction::Compare {
            document_id,
            expected_head_id,
            target_version_id,
        } => store
            .version_comparison(&document_id, &expected_head_id, &target_version_id)
            .map(HistoryReply::Comparison),
        HistoryAction::Restore { request } => {
            store.restore_version(request).map(HistoryReply::Document)
        }
    }
}
