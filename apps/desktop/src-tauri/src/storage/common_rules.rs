use super::{Store, errors::database_error, queries};
use crate::domain::{document::validate_id, error::AppError};
use rusqlite::params;

const MAX_COMMON_RULES_BYTES: usize = 16 * 1024;

impl Store {
    pub fn common_rules(&self, document: &str, rules: Option<&str>) -> Result<String, AppError> {
        validate_id(document)?;
        if rules.is_some_and(|value| value.len() > MAX_COMMON_RULES_BYTES || value.contains('\0')) {
            return Err(AppError::invalid(
                "문서 공통 조건은 NUL이 없는 16 KiB 이내의 텍스트로 입력해 주세요.",
            ));
        }
        let connection = self.connection()?;
        queries::snapshot(&connection, document)?;
        if let Some(value) = rules {
            connection
                .execute(
                    "UPDATE documents SET common_rules=?1 WHERE id=?2",
                    params![value, document],
                )
                .map_err(database_error)?;
        }
        connection
            .query_row(
                "SELECT common_rules FROM documents WHERE id=?1",
                [document],
                |row| row.get(0),
            )
            .map_err(database_error)
    }
}
