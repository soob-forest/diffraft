use docreview_core::claude_adapter::{profile, settings};
use std::{
    fs,
    os::unix::fs::{PermissionsExt, symlink},
    path::Path,
};

#[test]
fn selected_path_is_private_durable_and_replaceable_without_authentication_data() {
    let directory = tempfile::tempdir().unwrap();
    let path = Path::new("/synthetic/공식 CLI/claude");
    assert!(settings::load(directory.path()).unwrap().is_none());
    settings::save(directory.path(), path).unwrap();
    assert_eq!(
        settings::load(directory.path()).unwrap().as_deref(),
        Some(path)
    );
    let file = directory.path().join("cli-settings.json");
    assert_eq!(
        fs::metadata(&file).unwrap().permissions().mode() & 0o777,
        0o600
    );
    let value: serde_json::Value = serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
    assert_eq!(value.as_object().unwrap().len(), 1);
    let next = Path::new("/synthetic/other/claude");
    settings::save(directory.path(), next).unwrap();
    assert_eq!(
        settings::load(directory.path()).unwrap().as_deref(),
        Some(next)
    );
}

#[test]
fn invalid_settings_are_rejected_and_regular_corruption_can_be_replaced_by_reselection() {
    let directory = tempfile::tempdir().unwrap();
    let file = directory.path().join("cli-settings.json");
    for invalid in [
        "relative".into(),
        format!("/{}", "a".repeat(profile::MAX_PATH_BYTES)),
        "/nul\0path".into(),
    ] {
        assert!(settings::save(directory.path(), Path::new(&invalid)).is_err());
        fs::write(&file, serde_json::json!({"executable":invalid}).to_string()).unwrap();
        assert!(settings::load(directory.path()).is_err());
    }
    for invalid in [
        "broken".into(),
        "x".repeat(32 * 1024 + 1),
        "{\"executable\":\"/synthetic\",\"unexpected\":true}".into(),
    ] {
        fs::write(&file, invalid).unwrap();
        assert!(settings::load(directory.path()).is_err());
    }
    settings::save(directory.path(), Path::new("/synthetic/claude")).unwrap();
    assert!(settings::load(directory.path()).is_ok());
}

#[test]
fn linked_settings_and_linked_session_directories_never_escape_app_storage() {
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().join("preserve");
    fs::write(&target, "unchanged").unwrap();
    symlink(&target, directory.path().join("cli-settings.json")).unwrap();
    assert!(settings::load(directory.path()).is_err());
    assert!(settings::save(directory.path(), Path::new("/synthetic/claude")).is_err());
    assert_eq!(fs::read_to_string(&target).unwrap(), "unchanged");
    let outside = tempfile::tempdir().unwrap();
    symlink(outside.path(), directory.path().join("linked")).unwrap();
    assert!(settings::private_directory(directory.path(), "linked").is_err());
    assert!(settings::private_directory(directory.path(), "../escape").is_err());
    let path = settings::private_directory(directory.path(), "cli-sessions").unwrap();
    assert_eq!(
        fs::metadata(&path).unwrap().permissions().mode() & 0o777,
        0o700
    );
    assert_eq!(
        settings::private_directory(directory.path(), "cli-sessions").unwrap(),
        path
    );
}
