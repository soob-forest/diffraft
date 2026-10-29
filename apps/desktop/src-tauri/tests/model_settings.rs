use docreview_core::{
    claude_adapter::{model_settings, profile, settings},
    domain::{ai::ResponseMode, model::ModelSelection},
};
use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
    path::Path,
    sync::{Arc, Barrier},
};

#[test]
fn offline_settings_round_trip_without_cli_or_path_changes() {
    let root = tempfile::tempdir().unwrap();
    assert_eq!(
        model_settings::load(root.path()).unwrap(),
        ModelSelection::CliDefault
    );
    settings::save(root.path(), Path::new("/synthetic/claude")).unwrap();
    for model in [
        ModelSelection::Sonnet,
        ModelSelection::Opus,
        ModelSelection::Haiku,
        ModelSelection::CliDefault,
    ] {
        assert_eq!(model_settings::save(root.path(), model).unwrap(), model);
        assert_eq!(model_settings::load(root.path()).unwrap(), model);
        assert_eq!(
            settings::load(root.path()).unwrap().unwrap(),
            Path::new("/synthetic/claude")
        );
    }
    assert_eq!(
        fs::metadata(root.path().join("model-settings.json"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o600
    );
}

#[test]
fn corrupt_unknown_oversized_and_linked_settings_are_not_overwritten() {
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("model-settings.json");
    for bytes in [
        "broken".to_string(),
        r#"{"model":"unknown"}"#.into(),
        r#"{"model":"sonnet","extra":true}"#.into(),
        "x".repeat(1025),
    ] {
        fs::write(&file, &bytes).unwrap();
        assert!(model_settings::load(root.path()).is_err());
        assert!(model_settings::save(root.path(), ModelSelection::Opus).is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), bytes);
    }
    fs::remove_file(&file).unwrap();
    let outside = root.path().join("outside");
    fs::write(&outside, "preserve").unwrap();
    symlink(&outside, &file).unwrap();
    assert!(model_settings::load(root.path()).is_err());
    assert!(model_settings::save(root.path(), ModelSelection::Haiku).is_err());
    assert_eq!(fs::read_to_string(outside).unwrap(), "preserve");
}

#[test]
fn concurrent_saves_remain_complete_and_directory_failures_are_explicit() {
    let root = tempfile::tempdir().unwrap();
    let barrier = Arc::new(Barrier::new(3));
    let workers: Vec<_> = [ModelSelection::Sonnet, ModelSelection::Opus]
        .into_iter()
        .map(|model| {
            let path = root.path().to_owned();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                barrier.wait();
                model_settings::save(&path, model).unwrap();
            })
        })
        .collect();
    barrier.wait();
    for worker in workers {
        worker.join().unwrap();
    }
    assert!(matches!(
        model_settings::load(root.path()).unwrap(),
        ModelSelection::Sonnet | ModelSelection::Opus
    ));
    assert!(model_settings::save(&root.path().join("missing"), ModelSelection::Sonnet).is_err());
}

#[test]
fn real_argument_builder_preserves_restrictions_and_resume_for_every_model_and_mode() {
    let session = "10000000-0000-4000-8000-000000000001";
    for mode in [
        ResponseMode::Patch,
        ResponseMode::Explain,
        ResponseMode::Rewrite,
    ] {
        for model in [
            ModelSelection::CliDefault,
            ModelSelection::Sonnet,
            ModelSelection::Opus,
            ModelSelection::Haiku,
        ] {
            let args = profile::model_arguments(mode, Some(session), model).unwrap();
            let base = profile::arguments(mode, Some(session)).unwrap();
            assert_eq!(&args[..base.len()], base);
            assert_eq!(
                args.iter().filter(|arg| *arg == "--model").count(),
                usize::from(model.alias().is_some())
            );
            if let Some(alias) = model.alias() {
                assert_eq!(args.last().unwrap(), alias);
            }
        }
    }
    for invalid in [r#""unknown""#, r#""--help""#, "null", "1"] {
        assert!(serde_json::from_str::<ModelSelection>(invalid).is_err());
    }
}

#[test]
fn permission_failure_preserves_the_previous_model() {
    let root = tempfile::tempdir().unwrap();
    model_settings::save(root.path(), ModelSelection::Sonnet).unwrap();
    fs::set_permissions(root.path(), fs::Permissions::from_mode(0o500)).unwrap();
    let result = model_settings::save(root.path(), ModelSelection::Opus);
    fs::set_permissions(root.path(), fs::Permissions::from_mode(0o700)).unwrap();
    assert!(result.is_err());
    assert_eq!(
        model_settings::load(root.path()).unwrap(),
        ModelSelection::Sonnet
    );
}

#[test]
fn concurrent_read_and_save_only_observe_complete_settings() {
    let root = tempfile::tempdir().unwrap();
    model_settings::save(root.path(), ModelSelection::Sonnet).unwrap();
    let barrier = Arc::new(Barrier::new(2));
    let path = root.path().to_owned();
    let signal = barrier.clone();
    let writer = std::thread::spawn(move || {
        signal.wait();
        model_settings::save(&path, ModelSelection::Opus).unwrap();
    });
    barrier.wait();
    assert!(matches!(
        model_settings::load(root.path()).unwrap(),
        ModelSelection::Sonnet | ModelSelection::Opus
    ));
    writer.join().unwrap();
    assert_eq!(
        model_settings::load(root.path()).unwrap(),
        ModelSelection::Opus
    );
}
