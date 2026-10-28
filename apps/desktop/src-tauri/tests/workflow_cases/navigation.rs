use crate::{support::World, world::add_task};
use docreview_core::storage::{Store, runtime::Runtime};

#[test]
fn selected_document_and_each_task_survive_restart_and_read_only_refreshes() {
    let world = World::new();
    let first = &world.document.id;
    add_task(&world, first);
    let last_task = add_task(&world, first);
    let second = world
        .store
        .create_document(&world.directory.path().join("second.md"))
        .unwrap();
    let other_task = add_task(&world, &second.id);
    world.store.select_task(first, Some(&last_task)).unwrap();
    world
        .store
        .select_task(&second.id, Some(&other_task))
        .unwrap();
    world.store.select_document(&second.id).unwrap();
    world.store.editor_state(first).unwrap();
    drop(world.store);
    let store = Store::open(&world.directory.path().join("data")).unwrap();
    assert_eq!(
        store.workspace().unwrap().selected_document_id.as_deref(),
        Some(second.id.as_str())
    );
    assert_eq!(
        store.editor_state(first).unwrap().selected_task_id,
        Some(last_task)
    );
    assert_eq!(
        store.editor_state(&second.id).unwrap().selected_task_id,
        Some(other_task)
    );
}

#[test]
fn explicit_empty_task_differs_from_legacy_selection() {
    let world = World::new();
    let first = add_task(&world, &world.document.id);
    assert_eq!(
        world
            .store
            .editor_state(&world.document.id)
            .unwrap()
            .selected_task_id,
        Some(first)
    );
    world.store.select_task(&world.document.id, None).unwrap();
    drop(world.store);
    let store = Store::open(&world.directory.path().join("data")).unwrap();
    assert_eq!(
        store
            .editor_state(&world.document.id)
            .unwrap()
            .selected_task_id,
        None
    );
}

#[test]
fn invalid_or_foreign_selection_preserves_previous_document_and_task() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let second = world
        .store
        .create_document(&world.directory.path().join("second.md"))
        .unwrap();
    let foreign = add_task(&world, &second.id);
    world.store.select_document(&world.document.id).unwrap();
    world
        .store
        .select_task(&world.document.id, Some(&task))
        .unwrap();
    for id in ["invalid".to_owned(), world.runtime.id(), foreign] {
        assert!(
            world
                .store
                .select_task(&world.document.id, Some(&id))
                .is_err()
        );
    }
    assert!(world.store.select_task(&world.runtime.id(), None).is_err());
    assert!(world.store.select_document(&world.runtime.id()).is_err());
    assert_eq!(
        world
            .store
            .editor_state(&world.document.id)
            .unwrap()
            .selected_task_id,
        Some(task)
    );
    assert_eq!(
        world.store.workspace().unwrap().selected_document_id,
        Some(world.document.id)
    );
}

#[test]
fn busy_database_does_not_commit_selection_and_retry_succeeds() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    world.store.select_task(&world.document.id, None).unwrap();
    let connection = world.database();
    connection.execute_batch("BEGIN IMMEDIATE;").unwrap();
    assert!(world.store.select_document(&world.document.id).is_err());
    assert!(
        world
            .store
            .select_task(&world.document.id, Some(&task))
            .is_err()
    );
    assert_eq!(world.store.workspace().unwrap().selected_document_id, None);
    assert_eq!(
        world
            .store
            .editor_state(&world.document.id)
            .unwrap()
            .selected_task_id,
        None
    );
    connection.execute_batch("ROLLBACK;").unwrap();
    world.store.select_document(&world.document.id).unwrap();
    world
        .store
        .select_task(&world.document.id, Some(&task))
        .unwrap();
    assert_eq!(
        world
            .store
            .editor_state(&world.document.id)
            .unwrap()
            .selected_task_id,
        Some(task)
    );
}
