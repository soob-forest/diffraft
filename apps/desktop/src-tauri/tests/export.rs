#[path = "export_cases/context.rs"]
mod context;
#[path = "export_cases/crash.rs"]
mod crash;
#[path = "export_cases/files.rs"]
mod files;
#[path = "export_cases/snapshots.rs"]
mod snapshots;
mod support;
#[path = "export_cases/working_file.rs"]
mod working_file;
#[path = "review_cases/world.rs"]
mod world;

use docreview_core::domain::{document::DocumentSnapshot, export::ExportRequest};

fn request(document: &DocumentSnapshot) -> ExportRequest {
    ExportRequest {
        schema_version: 1,
        document_id: document.id.clone(),
        expected_head_id: document.version_id.clone(),
        expected_path: document.path.clone(),
    }
}
