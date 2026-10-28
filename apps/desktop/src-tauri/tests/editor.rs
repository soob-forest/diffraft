mod support;
use docreview_core::{
    commands::editor,
    document::{
        coordinates::{grapheme_boundary, utf16_to_byte},
        links::external_url,
        parse::analyze,
    },
    domain::{
        editor::{EditorAction, EditorRequest, ScopeSelection, TaskSnapshot},
        error::ErrorCode,
    },
    storage::{Store, runtime::Runtime},
};
use support::World;

#[test]
fn parses_source_blocks_and_sections_without_code_headings() {
    let text = "\u{feff}# 전체\r\n\r\n같은 문단\r\n\r\n## 하위\r\n\r\n같은 문단\r\n\r\n```md\r\n# 코드\r\n```\r\n\r\n| A | B |\r\n| - | - |\r\n| a\\|b | c |\r\n\r\n# 다음\r\n";
    let parsed = analyze(text);
    assert_eq!(
        parsed
            .headings
            .iter()
            .map(|h| h.title.as_str())
            .collect::<Vec<_>>(),
        ["전체", "하위", "다음"]
    );
    assert_eq!(parsed.headings[0].to, parsed.headings[2].from);
    assert_eq!(parsed.headings[1].to, parsed.headings[2].from);
    assert_eq!(parsed.headings[0].from_utf16, 1);
    let repeats: Vec<_> = parsed
        .blocks
        .iter()
        .filter(|b| b.text.starts_with("같은"))
        .collect();
    assert_eq!(repeats.len(), 2);
    assert_ne!(repeats[0].id, repeats[1].id);
    assert_eq!(repeats[1].heading_path, ["전체", "하위"]);
    assert!(parsed.blocks.iter().any(|b| b.text.contains("a\\|b")));
    assert_source_blocks(text, parsed.blocks);
}

#[test]
fn rejects_surrogate_grapheme_and_crlf_splits() {
    let text = "한😀e\u{301}\r\n끝";
    assert_eq!(utf16_to_byte(text, 1).unwrap(), 3);
    assert!(utf16_to_byte(text, 2).is_err());
    assert_eq!(utf16_to_byte(text, 3).unwrap(), 7);
    assert!(grapheme_boundary(text, 8).is_err());
    assert!(grapheme_boundary(text, 11).is_err());
    assert!(utf16_to_byte(text, 999).is_err());
}

#[test]
fn pins_scope_to_exact_saved_head_and_rejects_stale_and_external() {
    let world = World::new();
    let scope = world
        .store
        .scope(&world.document.id, 1, ScopeSelection::Whole)
        .unwrap();
    assert_eq!(scope.text, support::INITIAL_CONTENT);
    assert_eq!(scope.content_hash, world.document.content_hash);
    let section = world
        .store
        .scope(
            &world.document.id,
            1,
            ScopeSelection::Section { cursor: 10 },
        )
        .unwrap();
    assert_eq!(section.from, 3);
    assert!(
        world
            .store
            .scope(&world.document.id, 2, ScopeSelection::Whole)
            .is_err()
    );
    std::fs::write(&world.path, "외부 수정").unwrap();
    assert_eq!(
        world
            .store
            .scope(&world.document.id, 1, ScopeSelection::Whole)
            .unwrap_err()
            .code,
        ErrorCode::FileConflict
    );
}

#[test]
fn persists_isolated_tasks_and_does_not_allow_reassignment() {
    let world = World::new();
    let task = TaskSnapshot {
        id: world.runtime.id(),
        document_id: world.document.id.clone(),
        goal: "간결하게".into(),
        pinned_rules: "숫자 유지".into(),
        summary: String::new(),
    };
    world.store.put_task(task.clone()).unwrap();
    let other = world
        .store
        .create_document(&world.directory.path().join("other.md"))
        .unwrap();
    assert!(
        world
            .store
            .put_task(TaskSnapshot {
                document_id: other.id.clone(),
                ..task.clone()
            })
            .is_err()
    );
    assert!(
        world
            .store
            .editor_state(&other.id)
            .unwrap()
            .tasks
            .is_empty()
    );
    assert!(
        world
            .store
            .put_task(TaskSnapshot {
                goal: String::new(),
                ..task.clone()
            })
            .is_err()
    );
    let document_id = world.document.id.clone();
    drop(world.store);
    let reopened = Store::open(&world.directory.path().join("data")).unwrap();
    let tasks = reopened.editor_state(&document_id).unwrap().tasks;
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0].pinned_rules, "숫자 유지");
}

#[test]
fn new_document_never_overwrites_an_existing_file_or_link() {
    let world = World::new();
    assert!(world.store.create_document(&world.path).is_err());
    let link = world.directory.path().join("link.md");
    std::os::unix::fs::symlink(&world.path, &link).unwrap();
    assert!(world.store.create_document(&link).is_err());
    assert_eq!(
        std::fs::read_to_string(&world.path).unwrap(),
        support::INITIAL_CONTENT
    );
    let new = world
        .store
        .create_document(&world.directory.path().join("new.md"))
        .unwrap();
    let versions: u32 = world
        .database()
        .query_row(
            "SELECT COUNT(*) FROM versions WHERE document_id=?1",
            [&new.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(versions, 1);
    assert_eq!(new.version, 1);
    assert_eq!(new.content, "");
    assert!(
        world
            .store
            .create_document(&world.directory.path().join("new.txt"))
            .is_err()
    );
}

#[test]
fn editor_boundary_validates_schema_and_limits_before_io() {
    let world = World::new();
    let request = EditorRequest {
        schema_version: 999,
        action: EditorAction::Read {
            document_id: world.document.id.clone(),
        },
    };
    assert_eq!(
        editor(&world.store, request).unwrap_err().code,
        ErrorCode::SchemaUnsupported
    );
    let mut save = world.request();
    save.content = "가".repeat(1024 * 1024 / 3 + 1);
    assert!(world.store.save(save).is_err());
    assert_eq!(world.store.snapshot(&world.document.id).unwrap().version, 1);
}

#[test]
fn preview_links_reject_execution_local_files_credentials_and_controls() {
    for value in [
        "javascript:alert(1)",
        "data:text/html,x",
        "file:///tmp/x",
        "https://u:p@example.com",
        "https://example.com\n",
        "relative.md",
    ] {
        assert!(external_url(value).is_err(), "{value}");
    }
    for value in [
        "https://example.com/한글",
        "http://example.com",
        "mailto:test@example.com",
    ] {
        assert!(external_url(value).is_ok());
    }
}

fn assert_source_blocks(text: &str, blocks: Vec<docreview_core::domain::editor::SourceBlock>) {
    for block in blocks {
        assert_eq!(&text[block.from as usize..block.to as usize], block.text);
    }
}

#[test]
fn local_documents_have_private_unique_paths_and_reject_symlinked_folders() {
    use std::os::unix::fs::PermissionsExt;
    let world = World::new();
    let data = world.directory.path().join("data");
    let first = world.store.create_local_document(&data).unwrap();
    let second = world.store.create_local_document(&data).unwrap();
    assert_eq!(first.title, "새 문서");
    assert_ne!(first.path, second.path);
    assert!(first.path.contains("/data/documents/"));
    assert_eq!(
        std::fs::metadata(&first.path).unwrap().permissions().mode() & 0o777,
        0o600
    );
    let linked = world.directory.path().join("linked");
    std::fs::create_dir(&linked).unwrap();
    std::os::unix::fs::symlink(data.join("documents"), linked.join("documents")).unwrap();
    assert!(world.store.create_local_document(&linked).is_err());
}
