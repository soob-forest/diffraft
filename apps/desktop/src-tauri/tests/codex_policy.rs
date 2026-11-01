use docreview_core::codex_adapter::policy::{DISABLED_FEATURES, restrictions, verify_restrictions};
use serde_json::json;

#[test]
fn disables_each_inherited_server_instead_of_assuming_empty_table_replaces_it() {
    let original = json!({"mcp_servers":{
        "fixture-one":{"command":"not-executed","env":{"KEY":"SECRET_FIXTURE"}},
        "fixture.two":{"url":"https://example.invalid"}},"features":{"hooks":true}});
    let overrides = restrictions(&original).unwrap();
    assert_eq!(
        overrides["mcp_servers"]["fixture-one"],
        json!({"enabled":false})
    );
    assert_eq!(
        overrides["mcp_servers"]["fixture.two"],
        json!({"enabled":false})
    );
    assert!(!overrides.to_string().contains("SECRET_FIXTURE"));
    verify_restrictions(&overrides).unwrap();
    assert_eq!(original["features"]["hooks"], true);
}

#[test]
fn refuses_reenabled_tools_or_unchecked_config_after_merging() {
    let safe = restrictions(&json!({})).unwrap();
    for name in DISABLED_FEATURES {
        let mut changed = safe.clone();
        changed["features"][name] = true.into();
        assert!(verify_restrictions(&changed).is_err());
    }
    for (key, value) in [
        ("web_search", json!("live")),
        ("approval_policy", json!("on-request")),
        ("sandbox_mode", json!("workspace-write")),
        ("notify", json!(["command"])),
        ("project_doc_max_bytes", json!(1024)),
        ("allow_login_shell", json!(true)),
        ("mcp_servers", json!({"new-server":{}})),
    ] {
        let mut changed = safe.clone();
        changed[key] = value;
        assert!(verify_restrictions(&changed).is_err());
    }
    assert!(verify_restrictions(&json!({})).is_err());
}

#[test]
fn refuses_custom_billing_routes_without_returning_config_contents() {
    for value in [
        json!({"model_provider":"third-party"}),
        json!({"model_providers":{"openai":{"env_key":"SECRET_FIXTURE"}}}),
        json!({"openai_base_url":"https://example.invalid/SECRET_FIXTURE"}),
        json!({"chatgpt_base_url":"https://example.invalid"}),
        json!({"forced_login_method":"api"}),
    ] {
        let error = restrictions(&value).unwrap_err();
        assert!(!error.message.contains("SECRET_FIXTURE"));
    }
    assert!(
        restrictions(&json!({"model_provider":"openai","forced_login_method":"chatgpt"})).is_ok()
    );
}

#[test]
fn refuses_malformed_and_unbounded_server_configuration() {
    for value in [
        json!(null),
        json!({"mcp_servers":[]}),
        json!({"mcp_servers":{"\n":{}}}),
        json!({"mcp_servers":{"":{}}}),
    ] {
        assert!(restrictions(&value).is_err());
    }
    let servers: serde_json::Map<String, serde_json::Value> = (0..129)
        .map(|i| (format!("server-{i}"), json!({})))
        .collect();
    assert!(restrictions(&json!({"mcp_servers":servers})).is_err());
}

#[test]
fn official_chatgpt_default_is_normalized_but_lookalikes_are_rejected() {
    for address in ["https://chatgpt.com", "https://chatgpt.com/backend-api/"] {
        assert!(restrictions(&json!({"chatgpt_base_url":address})).is_ok());
    }
    for address in [
        "http://chatgpt.com/backend-api",
        "https://chatgpt.com.evil.invalid",
        "https://user@chatgpt.com/backend-api",
        "https://chatgpt.com/backend-api?key=fixture",
        "https://chatgpt.com:8443/backend-api",
        "https://chatgpt.com/other",
    ] {
        assert!(restrictions(&json!({"chatgpt_base_url":address})).is_err());
    }
}
