use super::{
    Store,
    errors::{conflict, database_error, lock_error},
    export_files::ExportDestination,
    files, queries,
};
use crate::domain::{
    document::{DocumentSnapshot, DocumentStatus},
    error::{AppError, ErrorCode},
    export::{ExportFileKind, ExportFileRequest, ExportRequest, ExportSaved, ExportSnapshot},
};
use rusqlite::{Connection, params};
use std::path::Path;

impl Store {
    pub fn export_snapshot(&self, request: &ExportRequest) -> Result<ExportSnapshot, AppError> {
        request.validate()?;
        let lock = self.document_lock(&request.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let connection = self.connection()?;
        let document = export_head(&connection, request)?;
        let pending_groups = connection.query_row(
            "SELECT COUNT(*) FROM (SELECT p.batch_id,p.group_id FROM proposals p JOIN proposal_batches b ON b.id=p.batch_id JOIN versions v ON v.id=b.base_version_id WHERE v.document_id=?1 AND b.status='ACTIVE' AND p.decision='PENDING' GROUP BY p.batch_id,p.group_id)",
            [&document.id], |row| row.get(0)).map_err(database_error)?;
        let pending_rewrites = connection.query_row(
            "SELECT COUNT(*) FROM proposal_batches b JOIN versions v ON v.id=b.base_version_id WHERE v.document_id=?1 AND b.status='ACTIVE' AND b.mode='REWRITE'",
            [&document.id], |row| row.get(0)).map_err(database_error)?;
        Ok(ExportSnapshot {
            document,
            pending_groups,
            pending_rewrites,
        })
    }

    pub fn export_file(
        &self,
        request: &ExportFileRequest,
        destination: &ExportDestination,
    ) -> Result<ExportSaved, AppError> {
        request.snapshot.validate()?;
        let lock = self.document_lock(&request.snapshot.document_id)?;
        let _guard = lock.lock().map_err(|_| lock_error())?;
        let mut connection = self.connection()?;
        let document = export_head(&connection, &request.snapshot)?;
        let path = destination
            .path()
            .to_str()
            .ok_or_else(|| AppError::invalid("UTF-8 파일 경로만 지원합니다."))?;
        if queries::document_at_path(&connection, path)?.is_some() {
            return Err(AppError::invalid(
                "등록된 작업 파일은 내보내기로 덮어쓸 수 없습니다. 다른 이름을 선택해 주세요.",
            ));
        }
        destination.write(&document.content)?;
        #[cfg(feature = "test-support")]
        self.export_checkpoint(super::export_testing::ExportStage::CopyWritten)?;
        if request.kind == ExportFileKind::WorkingFile {
            self.bind_export(&mut connection, &document, path)?;
            #[cfg(feature = "test-support")]
            self.export_checkpoint(super::export_testing::ExportStage::PathBound)?;
        }
        Ok(ExportSaved {
            document: queries::snapshot(&connection, &document.id)?,
            path: path.into(),
        })
    }

    fn bind_export(
        &self,
        connection: &mut Connection,
        document: &DocumentSnapshot,
        path: &str,
    ) -> Result<(), AppError> {
        let result = (|| {
            files::verify_hash(Path::new(&document.path), &document.content_hash)?;
            files::verify_hash(Path::new(path), &document.content_hash)?;
            let transaction = connection.transaction().map_err(database_error)?;
            transaction
                .execute(
                    "UPDATE documents SET canonical_path=?1 WHERE id=?2",
                    params![path, document.id],
                )
                .map_err(database_error)?;
            #[cfg(feature = "test-support")]
            self.export_checkpoint(super::export_testing::ExportStage::PathUpdating)?;
            let sequence = queries::next_sequence(&transaction)?;
            let payload = serde_json::json!({"contentUnchanged":true}).to_string();
            transaction.execute("INSERT INTO decision_events(id,document_id,seq,kind,payload,version_id,created_at) VALUES(?1,?2,?3,'working_file_changed',?4,?5,?6)", params![self.runtime.id(),document.id,sequence,payload,document.version_id,self.runtime.now_ms()?]).map_err(database_error)?;
            transaction.commit().map_err(database_error)
        })();
        result.map_err(|error: AppError| AppError::new(error.code, "사본 파일은 저장했지만 작업 파일 경로를 변경하지 못했습니다. 기존 경로와 새 사본을 확인해 주세요."))
    }
}

fn export_head(
    connection: &Connection,
    request: &ExportRequest,
) -> Result<DocumentSnapshot, AppError> {
    let document = queries::snapshot(connection, &request.document_id)?;
    if document.version_id != request.expected_head_id || document.path != request.expected_path {
        return Err(AppError::new(
            ErrorCode::StaleBase,
            "문서 버전 또는 작업 파일 경로가 바뀌었습니다. 내보내기를 다시 열어 주세요.",
        ));
    }
    if document.status != DocumentStatus::Ready {
        return Err(conflict());
    }
    if files::verify_hash(Path::new(&document.path), &document.content_hash).is_err() {
        queries::set_status(connection, &document.id, "CONFLICT")?;
        return Err(conflict());
    }
    Ok(document)
}
