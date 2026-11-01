use crate::support::World;
use docreview_core::domain::{
    ai_settings::AiSettingsAction,
    provider::{AiProvider, ProviderModel, ReasoningEffort},
};

fn choice() -> ProviderModel {
    ProviderModel::Codex {
        model: "fixture-model".into(),
        effort: ReasoningEffort::Low,
    }
}

#[test]
fn concurrent_column_updates_preserve_each_provider_path_and_model_choice() {
    let world = World::new();
    std::thread::scope(|scope| {
        let provider = scope.spawn(|| {
            world
                .store
                .update_ai_preferences(AiSettingsAction::Provider {
                    provider: AiProvider::Claude,
                })
        });
        let model = scope.spawn(|| {
            world.store.update_ai_preferences(AiSettingsAction::Model {
                model: Some(choice()),
            })
        });
        let path = scope.spawn(|| {
            world
                .store
                .update_ai_preferences(AiSettingsAction::CodexPath {
                    path: "/fixture/codex".into(),
                })
        });
        provider.join().unwrap().unwrap();
        model.join().unwrap().unwrap();
        path.join().unwrap().unwrap();
    });
    let prefs = world.store.ai_preferences().unwrap();
    assert_eq!(prefs.provider, AiProvider::Claude);
    assert_eq!(prefs.codex_model, Some(choice()));
    assert_eq!(prefs.codex_path.as_deref(), Some("/fixture/codex"));
}

#[test]
fn failed_database_write_preserves_saved_preferences_and_reports_a_fixed_error() {
    let world = World::new();
    let original = serde_json::to_value(world.store.ai_preferences().unwrap()).unwrap();
    world.database().execute_batch("CREATE TRIGGER deny_ai_settings BEFORE UPDATE ON ai_preferences BEGIN SELECT RAISE(ABORT,'SECRET_FIXTURE'); END;").unwrap();
    let error = world
        .store
        .update_ai_preferences(AiSettingsAction::Model {
            model: Some(choice()),
        })
        .unwrap_err();
    assert!(!error.message.contains("SECRET_FIXTURE"));
    assert_eq!(
        serde_json::to_value(world.store.ai_preferences().unwrap()).unwrap(),
        original
    );
}

#[test]
fn corrupt_codex_preferences_fail_closed_and_corrupt_claude_settings_do_not_block_codex() {
    let world = World::new();
    std::fs::write(
        world.store.directory().join("model-settings.json"),
        "broken",
    )
    .unwrap();
    assert_eq!(
        world.store.ai_preferences().unwrap().provider,
        AiProvider::Codex
    );
    world
        .database()
        .execute(
            "UPDATE ai_preferences SET codex_model=?1",
            [r#"{"provider":"claude","model":"sonnet"}"#],
        )
        .unwrap();
    assert!(world.store.ai_preferences().is_err());
    assert!(
        world
            .store
            .update_ai_preferences(AiSettingsAction::Provider {
                provider: AiProvider::Claude
            })
            .is_err()
    );
    let stored: String = world
        .database()
        .query_row("SELECT codex_model FROM ai_preferences", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert!(stored.contains("claude"));
}
