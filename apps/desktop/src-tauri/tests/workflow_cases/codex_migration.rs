use crate::support::World;
use docreview_core::{
    domain::{
        ai_settings::AiSettingsAction,
        provider::{AiProvider, ProviderModel, ReasoningEffort},
    },
    storage::Store,
};

pub fn remove_codex_schema(world: &World) {
    world.database().execute_batch("DROP TABLE codex_execution_scopes; DROP TABLE codex_sessions; DROP TABLE ai_preferences;").unwrap();
}

#[test]
fn new_workspace_defaults_to_codex_and_offline_choices_survive_restart() {
    let world = World::new();
    assert_eq!(
        world.store.ai_preferences().unwrap().provider,
        AiProvider::Codex
    );
    let model = ProviderModel::Codex {
        model: "fixture-model".into(),
        effort: ReasoningEffort::Medium,
    };
    world
        .store
        .update_ai_preferences(AiSettingsAction::Model {
            model: Some(model.clone()),
        })
        .unwrap();
    world
        .store
        .update_ai_preferences(AiSettingsAction::CodexPath {
            path: "/not-installed/codex".into(),
        })
        .unwrap();
    world
        .store
        .update_ai_preferences(AiSettingsAction::Provider {
            provider: AiProvider::Claude,
        })
        .unwrap();
    let data = world.store.directory().to_owned();
    drop(world.store);
    let store = Store::open(&data).unwrap();
    let prefs = store.ai_preferences().unwrap();
    assert_eq!(prefs.provider, AiProvider::Claude);
    assert_eq!(prefs.codex_model, Some(model));
    assert_eq!(prefs.codex_path.as_deref(), Some("/not-installed/codex"));
    assert!(
        store
            .update_ai_preferences(AiSettingsAction::CodexPath {
                path: "relative/codex".into()
            })
            .is_err()
    );
}

#[test]
fn v7_upgrade_keeps_claude_and_preserves_versions_with_backup() {
    let world = World::new();
    let head = world.store.save(world.request()).unwrap();
    remove_codex_schema(&world);
    world
        .database()
        .pragma_update(None, "user_version", 7)
        .unwrap();
    let data = world.store.directory().to_owned();
    drop(world.store);
    let store = Store::open(&data).unwrap();
    assert_eq!(store.ai_preferences().unwrap().provider, AiProvider::Claude);
    assert_eq!(store.snapshot(&head.id).unwrap().content, head.content);
    assert!(std::fs::read_dir(data).unwrap().any(|e| {
        e.unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("workspace.schema-7.")
    }));
}

#[test]
fn conflicting_v8_schema_rolls_back_and_preserves_v7_history() {
    let world = World::new();
    remove_codex_schema(&world);
    world.database().execute_batch("CREATE TABLE ai_preferences(original TEXT); INSERT INTO ai_preferences VALUES('preserve'); PRAGMA user_version=7;").unwrap();
    let data = world.store.directory().to_owned();
    drop(world.store);
    assert!(Store::open(&data).is_err());
    let db = rusqlite::Connection::open(data.join("workspace.sqlite3")).unwrap();
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, u32>(0))
            .unwrap(),
        7
    );
    assert_eq!(
        db.query_row("SELECT original FROM ai_preferences", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "preserve"
    );
    assert_eq!(
        db.query_row("SELECT COUNT(*) FROM versions", [], |r| r.get::<_, u32>(0))
            .unwrap(),
        1
    );
}
