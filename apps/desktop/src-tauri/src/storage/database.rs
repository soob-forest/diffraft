use rusqlite::{Connection, OpenFlags};
use std::{fs, path::Path, time::Duration};

use super::{
    errors::{database_error, file_error},
    files::{private_permissions, sync_file},
};
use crate::domain::error::{AppError, ErrorCode};

const SCHEMA_VERSION: u32 = 6;
const DATABASE_FILE: &str = "workspace.sqlite3";
const BUSY_TIMEOUT_MS: u64 = 1000;
const INITIAL_MIGRATION: &str = include_str!("../../migrations/001-initial.sql");
const REVIEW_MIGRATION: &str = include_str!("../../migrations/002-review-workflow.sql");
const REVISION_JOBS_MIGRATION: &str = include_str!("../../migrations/003-revision-jobs.sql");
const REWRITE_JOBS_MIGRATION: &str = include_str!("../../migrations/004-rewrite-jobs.sql");
const GENERATION_MIGRATION: &str = include_str!("../../migrations/005-generation.sql");
const NAVIGATION_MIGRATION: &str = include_str!("../../migrations/006-navigation.sql");

pub fn open(directory: &Path) -> Result<Connection, AppError> {
    let path = directory.join(DATABASE_FILE);
    let existing = path.exists();
    if existing
        && fs::symlink_metadata(&path)
            .map_err(file_error)?
            .file_type()
            .is_symlink()
    {
        return Err(AppError::invalid(
            "작업 DB에 심볼릭 링크를 사용할 수 없습니다.",
        ));
    }
    let mut connection = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(database_error)?;
    let version: u32 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(database_error)?;
    if version > SCHEMA_VERSION {
        return Err(AppError::new(
            ErrorCode::SchemaUnsupported,
            "더 최신 앱에서 만든 작업 기록입니다. 최신 DocReview를 실행해 주세요.",
        ));
    }
    fs::set_permissions(&path, private_permissions()).map_err(file_error)?;
    connection
        .busy_timeout(Duration::from_millis(BUSY_TIMEOUT_MS))
        .map_err(database_error)?;
    configure(&connection)?;
    if version < SCHEMA_VERSION {
        if existing {
            backup(&connection, directory, version)?;
        }
        let transaction = connection.transaction().map_err(database_error)?;
        migrate(&transaction, version)?;
        transaction
            .pragma_update(None, "user_version", SCHEMA_VERSION)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
    }
    Ok(connection)
}

fn migrate(connection: &Connection, version: u32) -> Result<(), AppError> {
    if version < 1 {
        connection
            .execute_batch(INITIAL_MIGRATION)
            .map_err(database_error)?;
    }
    if version < 2 {
        connection
            .execute_batch(REVIEW_MIGRATION)
            .map_err(database_error)?;
    }
    if version < 3 {
        connection
            .execute_batch(REVISION_JOBS_MIGRATION)
            .map_err(database_error)?;
    }
    if version < 4 {
        connection
            .execute_batch(REWRITE_JOBS_MIGRATION)
            .map_err(database_error)?;
    }
    if version < 5 {
        connection
            .execute_batch(GENERATION_MIGRATION)
            .map_err(database_error)?;
    }
    if version < 6 {
        connection
            .execute_batch(NAVIGATION_MIGRATION)
            .map_err(database_error)?;
    }
    Ok(())
}

fn configure(connection: &Connection) -> Result<(), AppError> {
    connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA fullfsync=ON; PRAGMA checkpoint_fullfsync=ON;").map_err(database_error)
}

fn backup(connection: &Connection, directory: &Path, version: u32) -> Result<(), AppError> {
    let backup_path = directory.join(format!(
        "workspace.schema-{version}.{}.backup.sqlite3",
        uuid::Uuid::new_v4()
    ));
    let mut destination = Connection::open(&backup_path).map_err(database_error)?;
    rusqlite::backup::Backup::new(connection, &mut destination)
        .map_err(database_error)?
        .run_to_completion(32, Duration::ZERO, None)
        .map_err(database_error)?;
    fs::set_permissions(&backup_path, private_permissions()).map_err(file_error)?;
    sync_file(&fs::File::open(&backup_path).map_err(file_error)?)
}
