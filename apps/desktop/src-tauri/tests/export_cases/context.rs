use crate::{
    request,
    support::{INITIAL_CONTENT, World},
    world::add_task,
};
use docreview_core::{
    domain::{
        ai::{AiResponse, ResponseMode},
        editor::ScopeSelection,
        export::{ExportFileKind, ExportFileRequest},
        generation::GenerateRequest,
    },
    storage::{export_files::ExportDestination, review_jobs::BeginReviewJob, runtime::Runtime},
};

#[test]
fn changing_working_file_does_not_send_local_paths_to_ai() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let destination =
        ExportDestination::selected(&world.directory.path().join("private-title.md")).unwrap();
    let saved = world
        .store
        .export_file(
            &ExportFileRequest {
                snapshot: request(&world.document),
                kind: ExportFileKind::WorkingFile,
            },
            &destination,
        )
        .unwrap();
    let job = world
        .store
        .begin_generation(GenerateRequest {
            document_id: saved.document.id,
            task_id: task,
            expected_head_id: saved.document.version_id,
            operation_id: world.runtime.id(),
            mode: ResponseMode::Explain,
            selection: ScopeSelection::Whole,
            instruction: "원문 설명".into(),
            expected_active_batch_id: None,
            archive_previous: false,
            retry_of: None,
        })
        .unwrap();
    let context = world.store.generation_context(&job).unwrap();
    assert!(!context.contains(&world.document.path));
    assert!(!context.contains(&saved.path));
    assert!(context.contains("working_file_changed"));
}

#[test]
fn unapplied_rewrite_is_counted_without_exporting_its_candidate() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let job = world
        .store
        .begin_review_job(BeginReviewJob {
            document_id: world.document.id.clone(),
            task_id: task,
            expected_version: 1,
            selection: ScopeSelection::Whole,
        })
        .unwrap();
    world
        .store
        .register_rewrite(
            &job,
            &AiResponse::Rewrite {
                schema_version: 1,
                summary: "대체안".into(),
                candidate_markdown: "아직 승인하지 않은 재작성안".into(),
            },
        )
        .unwrap();
    let snapshot = world
        .store
        .export_snapshot(&request(&world.document))
        .unwrap();
    assert_eq!(snapshot.pending_groups, 0);
    assert_eq!(snapshot.pending_rewrites, 1);
    assert_eq!(snapshot.document.content, INITIAL_CONTENT);
}
