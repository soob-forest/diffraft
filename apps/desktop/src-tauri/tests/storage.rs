#[path = "storage_cases/basic.rs"]
mod basic;
#[cfg(feature = "test-support")]
#[path = "storage_cases/crash.rs"]
mod crash;
#[cfg(feature = "test-support")]
#[path = "storage_cases/failures.rs"]
mod failures;
#[path = "storage_cases/file_types.rs"]
mod file_types;
#[cfg(feature = "test-support")]
#[path = "storage_cases/recovery_edges.rs"]
mod recovery_edges;
#[path = "storage_cases/replay.rs"]
mod replay;
mod support;
