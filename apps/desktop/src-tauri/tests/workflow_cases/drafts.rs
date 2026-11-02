use crate::{support::World, world::add_task};
use docreview_core::{domain::drafts::DraftWrite, storage::Store};

#[test]
fn draft_cas_survives_restart_and_rejects_late_or_foreign_writes() {
    let world = World::new();
    let task = add_task(&world, &world.document.id);
    let request = DraftWrite {
        key: serde_json::to_string(&["request", &world.document.id, &task]).unwrap(),
        schema_version: 1,
        expected_revision: 0,
        value_json: Some("{\"instruction\":\"한글 😀\",\"mode\":\"PATCH\"}".into()),
    };
    let saved = world.store.write_draft(request.clone()).unwrap();
    assert_eq!(saved.revision, 1);
    assert!(world.store.write_draft(request.clone()).is_err());
    let mut invalid = request.clone();
    invalid.key = "[\"request\",\"foreign\",\"task\"]".into();
    assert!(world.store.write_draft(invalid).is_err());
    let directory = world.store.directory().to_owned();
    drop(world.store);
    let store = Store::open(&directory).unwrap();
    assert_eq!(
        store.read_drafts().unwrap()[0].value_json,
        request.value_json
    );
    let mut clear = request;
    clear.expected_revision = 1;
    clear.value_json = None;
    assert_eq!(store.write_draft(clear).unwrap().revision, 2);
    assert!(store.read_drafts().unwrap()[0].value_json.is_none());
}
