use docreview_core::verification_workspace::directory;
use std::{ffi::OsString, fs, os::unix::fs::PermissionsExt};

fn arguments(path: &std::path::Path) -> Vec<OsString> {
    vec![
        "docreview".into(),
        "--verification-workspace".into(),
        path.into(),
    ]
}
fn owned() -> tempfile::TempDir {
    let root = tempfile::Builder::new()
        .prefix("diffraft-verify-")
        .tempdir()
        .unwrap();
    fs::set_permissions(root.path(), fs::Permissions::from_mode(0o700)).unwrap();
    fs::write(
        root.path().join(".diffraft-verification"),
        "diffraft-verification-v1\n",
    )
    .unwrap();
    root
}
#[test]
fn explicit_owned_workspace_is_required_and_invalid_inputs_never_fall_back() {
    let root = owned();
    assert_eq!(
        directory(&arguments(root.path())).unwrap(),
        Some(root.path().canonicalize().unwrap().join("data"))
    );
    assert_eq!(directory(&["docreview".into()]).unwrap(), None);
    assert!(directory(&["docreview".into(), "--verification-workspace".into()]).is_err());
    assert!(directory(&arguments(std::path::Path::new("relative"))).is_err());
    fs::remove_file(root.path().join(".diffraft-verification")).unwrap();
    assert!(directory(&arguments(root.path())).is_err());
}
#[test]
fn shared_directories_and_symlinks_are_rejected() {
    let root = owned();
    fs::set_permissions(root.path(), fs::Permissions::from_mode(0o755)).unwrap();
    assert!(directory(&arguments(root.path())).is_err());
    fs::set_permissions(root.path(), fs::Permissions::from_mode(0o700)).unwrap();
    let elsewhere = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(elsewhere.path(), root.path().join("data")).unwrap();
    assert!(directory(&arguments(root.path())).is_err());
    fs::remove_file(root.path().join("data")).unwrap();
    fs::remove_file(root.path().join(".diffraft-verification")).unwrap();
    fs::write(
        elsewhere.path().join("marker"),
        "diffraft-verification-v1\n",
    )
    .unwrap();
    std::os::unix::fs::symlink(
        elsewhere.path().join("marker"),
        root.path().join(".diffraft-verification"),
    )
    .unwrap();
    assert!(directory(&arguments(root.path())).is_err());
}
