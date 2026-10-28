use super::option_status;
use crate::{claude_adapter::environment, domain::connection::ConnectionStatus};
use std::{collections::BTreeMap, ffi::OsString, fs, os::unix::fs::PermissionsExt};

fn inspect_fake(outcome: &str) -> (ConnectionStatus, bool) {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("fake-cli");
    let response = match outcome {
        "supported" => {
            "printf '%s\\n' 'No conversation found with session ID: 10000000-0000-4000-8000-000000000001' >&2; exit 1"
        }
        "unsupported" => "printf '%s\\n' \"error: unknown option '--restricted'\" >&2; exit 1",
        "unexpected" => "printf '%s\\n' 'diagnostic failed' >&2; exit 1",
        _ => unreachable!(),
    };
    fs::write(&path, format!("#!/bin/sh\nif [ \"$1\" = '--help' ]; then printf 'Usage: hidden options\\n'; exit 0; fi\ncat >/dev/null\ntouch parser-probed\n{response}\n")).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
    let env = environment::filtered(&BTreeMap::from([(
        OsString::from("HOME"),
        directory.path().as_os_str().into(),
    )]))
    .unwrap();
    let status = option_status(&path, directory.path(), &env, "2.1.312").unwrap();
    (status, directory.path().join("parser-probed").exists())
}

#[test]
fn hidden_help_options_are_checked_by_the_empty_input_parser_probe() {
    assert_eq!(inspect_fake("supported"), (ConnectionStatus::Ready, true));
}

#[test]
fn missing_options_and_unexpected_failures_remain_distinct() {
    assert_eq!(
        inspect_fake("unsupported"),
        (ConnectionStatus::Unsupported, true)
    );
    assert_eq!(
        inspect_fake("unexpected"),
        (ConnectionStatus::DiagnosticFailed, true)
    );
}
