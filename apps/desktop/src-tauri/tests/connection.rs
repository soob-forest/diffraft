use docreview_core::domain::ai::ResponseMode;
use docreview_core::{
    claude_adapter::{discovery, environment, profile},
    domain::{connection::ConnectionStatus, error::ErrorCode},
};
use std::{collections::BTreeMap, ffi::OsString, fs, os::unix::fs::PermissionsExt};

const SESSION: &str = "00000000-0000-4000-8000-000000000001";
fn auth() -> serde_json::Value {
    serde_json::json!({"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":"team","email":"synthetic@example.invalid"})
}
fn status(exit: Option<i32>, value: &serde_json::Value) -> ConnectionStatus {
    profile::authentication(exit, &serde_json::to_vec(value).unwrap(), false)
}

#[test]
fn authentication_requires_successful_official_subscription_diagnostics() {
    assert_eq!(status(Some(0), &auth()), ConnectionStatus::Ready);
    assert_eq!(
        status(Some(1), &serde_json::json!({"loggedIn":false})),
        ConnectionStatus::AuthRequired
    );
    for exit in [None, Some(1), Some(2)] {
        assert_eq!(status(exit, &auth()), ConnectionStatus::DiagnosticFailed);
    }
    for value in [
        serde_json::Value::Null,
        serde_json::json!([]),
        serde_json::json!({}),
        serde_json::json!({"loggedIn":"true"}),
    ] {
        assert_eq!(status(Some(0), &value), ConnectionStatus::DiagnosticFailed);
    }
    assert_eq!(
        profile::authentication(Some(0), b"invalid", false),
        ConnectionStatus::DiagnosticFailed
    );
}

#[test]
fn alternate_routes_and_environment_overrides_never_become_ready() {
    for (key, value) in [
        ("authMethod", "api_key"),
        ("apiProvider", "bedrock"),
        ("subscriptionType", "free"),
    ] {
        let mut value_auth = auth();
        value_auth[key] = value.into();
        assert_eq!(
            status(Some(0), &value_auth),
            ConnectionStatus::AuthRouteMismatch
        );
    }
    assert_eq!(
        profile::authentication(Some(0), &serde_json::to_vec(&auth()).unwrap(), true),
        ConnectionStatus::AuthRouteMismatch
    );
}

#[test]
fn supported_version_requires_every_restriction_flag() {
    let args = profile::arguments(ResponseMode::Explain, Some(SESSION)).unwrap();
    let help = args
        .iter()
        .map(|value| value.to_str().unwrap())
        .collect::<Vec<_>>()
        .join(" ");
    assert!(profile::supports(profile::MINIMUM_VERSION, help.as_bytes()));
    for flag in [
        "--safe-mode",
        "--restricted",
        "--tools",
        "--strict-mcp-config",
        "--resume",
    ] {
        assert!(!profile::supports(
            profile::MINIMUM_VERSION,
            help.replace(flag, "missing").as_bytes()
        ));
    }
    assert!(profile::supports("2.1.312", help.as_bytes()));
    assert!(!profile::supports(
        profile::MINIMUM_VERSION,
        b"--print-suffix"
    ));
    assert_eq!(
        profile::version(b"2.1.311 (Claude Code)\n"),
        Some("2.1.311".into())
    );
    for text in [
        b"2.1.311".as_slice(),
        b"x.y.z (Claude Code)",
        b"2.1.311.1 (Claude Code)",
    ] {
        assert_eq!(profile::version(text), None);
    }
}

#[test]
fn request_args_keep_tools_empty_and_resume_explicit() {
    let args = profile::arguments(ResponseMode::Explain, Some(SESSION)).unwrap();
    let value = |key: &str| {
        args[args.iter().position(|arg| arg == key).unwrap() + 1]
            .to_str()
            .unwrap()
    };
    assert_eq!(value("--tools"), "");
    assert_eq!(value("--mcp-config"), "{\"mcpServers\":{}}");
    assert_eq!(value("--permission-mode"), "dontAsk");
    assert_eq!(value("--permission-prompts"), "none");
    assert_eq!(value("--resume"), SESSION);
    assert!(!args.iter().any(|arg| {
        ["--bare", "--continue", "--no-session-persistence"].contains(&arg.to_str().unwrap())
    }));
    assert!(profile::arguments(ResponseMode::Explain, Some("../other-session")).is_err());
    assert!(
        !profile::arguments(ResponseMode::Explain, None)
            .unwrap()
            .iter()
            .any(|arg| arg == "--resume")
    );
}

#[test]
fn cli_schema_uses_supported_draft_seven_with_resolvable_local_references() {
    let args = profile::arguments(ResponseMode::Patch, None).unwrap();
    let index = args.iter().position(|arg| arg == "--json-schema").unwrap();
    let schema: serde_json::Value =
        serde_json::from_str(args[index + 1].to_str().unwrap()).unwrap();
    assert_eq!(schema["$schema"], "http://json-schema.org/draft-07/schema#");
    assert_eq!(schema["type"], "object");
    assert!(schema.get("oneOf").is_none());
    assert!(schema["definitions"]["AiChange"].is_object());
    assert_eq!(
        schema["properties"]["changes"]["items"]["$ref"],
        "#/definitions/AiChange"
    );
    assert_eq!(schema["additionalProperties"], false);
}

#[test]
fn cli_request_schema_allows_only_the_requested_response_mode() {
    for mode in [
        ResponseMode::Patch,
        ResponseMode::Rewrite,
        ResponseMode::Explain,
    ] {
        let args = profile::arguments(mode, None).unwrap();
        let index = args.iter().position(|arg| arg == "--json-schema").unwrap();
        let schema: serde_json::Value =
            serde_json::from_str(args[index + 1].to_str().unwrap()).unwrap();
        assert_eq!(
            schema["properties"]["mode"]["const"],
            serde_json::to_value(mode).unwrap()
        );
        for union in ["oneOf", "allOf", "anyOf"] {
            assert!(schema.get(union).is_none());
        }
    }
}

#[test]
fn diagnostic_report_contains_no_authentication_payload() {
    let report = profile::report(
        status(Some(0), &auth()),
        Some("/synthetic/claude".into()),
        Some("2.1.311".into()),
    );
    let json = serde_json::to_string(&report).unwrap();
    assert!(!json.contains("synthetic@example.invalid"));
    assert!(!json.contains("loggedIn"));
    assert!(json.contains("READY"));
}

#[test]
fn child_environment_filters_secrets_and_disables_automatic_updates() {
    let source = BTreeMap::from([
        (OsString::from("HOME"), OsString::from("/synthetic/home")),
        ("ANTHROPIC_API_KEY".into(), "synthetic-value".into()),
        ("UNRELATED_PRIVATE_SETTING".into(), "synthetic-value".into()),
        ("PATH".into(), "/untrusted/path".into()),
        ("LANG".into(), "ko_KR.UTF-8".into()),
    ]);
    let filtered = environment::filtered(&source).unwrap();
    assert!(filtered.overridden);
    assert!(
        !filtered
            .values
            .contains_key(&OsString::from("ANTHROPIC_API_KEY"))
    );
    assert!(
        !filtered
            .values
            .contains_key(&OsString::from("UNRELATED_PRIVATE_SETTING"))
    );
    assert_eq!(filtered.values[&OsString::from("DISABLE_AUTOUPDATER")], "1");
    assert_eq!(
        filtered.values[&OsString::from("PATH")],
        "/usr/bin:/bin:/usr/sbin:/sbin"
    );
    assert_eq!(filtered.values[&OsString::from("LANG")], "ko_KR.UTF-8");
    assert!(environment::filtered(&BTreeMap::new()).is_err());
}

#[test]
fn discovery_never_searches_relative_path_entries_or_accepts_non_executables() {
    let candidates = discovery::candidates(
        std::path::Path::new("/synthetic/home"),
        Some(std::ffi::OsStr::new(".:relative:/valid/bin")),
    );
    assert!(candidates.iter().all(|path| path.is_absolute()));
    assert!(candidates.contains(&"/valid/bin/claude".into()));
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("cli");
    fs::write(&path, "synthetic").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
    assert_eq!(
        discovery::executable(&path).unwrap_err().code,
        ErrorCode::CliUnsupported
    );
    assert!(discovery::executable(dir.path()).is_err());
    assert!(discovery::executable(std::path::Path::new("relative")).is_err());
}
