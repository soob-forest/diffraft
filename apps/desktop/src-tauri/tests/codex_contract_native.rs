//! Opt-in native contracts. Only the explicitly named generation test consumes account quota.
use docreview_core::{
    claude_adapter::process::ProcessSpec,
    codex_adapter::{account::chatgpt_scope, catalog::Catalog, policy, profile, transport::Peer},
};
use serde_json::{Value, json};
use std::{
    ffi::OsString,
    path::Path,
    sync::{Arc, atomic::AtomicBool},
    time::Duration,
};

fn start(directory: &Path, overrides: Option<&Value>) -> Peer {
    let program =
        std::env::var_os("DOCREVIEW_CODEX_BIN").expect("set DOCREVIEW_CODEX_BIN explicitly");
    let args = profile::arguments(overrides).unwrap();
    let environment = ["HOME", "PATH", "CODEX_HOME", "TMPDIR", "LANG"]
        .into_iter()
        .filter_map(|key| std::env::var_os(key).map(|value| (OsString::from(key), value)))
        .collect();
    let spec = ProcessSpec {
        program: program.into(),
        args,
        directory: directory.into(),
        environment,
        timeout: Duration::from_secs(20),
    };
    let mut peer = Peer::start(&spec, directory, Arc::new(AtomicBool::new(false))).unwrap();
    peer.call(1,"initialize",json!({"clientInfo":{"name":"docreview_contract_test","version":"0.1.0"},"capabilities":{"experimentalApi":true}})).unwrap();
    peer.send(b"{\"method\":\"initialized\"}\n").unwrap();
    peer
}

#[test]
#[ignore = "requires installed Codex with existing ChatGPT login; no generation or token reads"]
fn installed_account_models_and_effective_restrictions_match_contract() {
    let directory = tempfile::tempdir().unwrap();
    let mut peer = start(directory.path(), None);
    let original = peer
        .call(2, "config/read", json!({"includeLayers":false}))
        .unwrap();
    let overrides = policy::restrictions(&original["config"]).unwrap();
    peer.close().unwrap();
    let mut peer = start(directory.path(), Some(&overrides));
    let effective = peer
        .call(2, "config/read", json!({"includeLayers":false}))
        .unwrap();
    verify_effective(&effective["config"]);
    let account = peer
        .call(3, "account/read", json!({"refreshToken":false}))
        .unwrap();
    chatgpt_scope(&account).unwrap();
    let mut catalog = Catalog::default();
    let mut cursor = None::<String>;
    for id in 4..20 {
        let page = peer
            .call(
                id,
                "model/list",
                json!({"limit":100,"includeHidden":false,"cursor":cursor}),
            )
            .unwrap();
        cursor = catalog.append(page).unwrap();
        if cursor.is_none() {
            break;
        }
    }
    catalog.default_model().unwrap().validate().unwrap();
    assert!(!catalog.visible().unwrap().is_empty());
    peer.close().unwrap();
}

fn verify_effective(config: &Value) {
    for feature in policy::DISABLED_FEATURES {
        assert_eq!(config["features"][feature], false, "feature: {feature}");
    }
    for (key, expected) in [
        ("web_search", json!("disabled")),
        ("approval_policy", json!("never")),
        ("sandbox_mode", json!("read-only")),
        ("notify", json!([])),
        ("project_doc_max_bytes", json!(0)),
        ("allow_login_shell", json!(false)),
    ] {
        assert!(config[key] == expected, "effective setting mismatch: {key}");
    }
    assert!(
        config["mcp_servers"]
            .as_object()
            .is_none_or(|servers| servers.values().all(|v| v["enabled"] == false)),
        "MCP enabled"
    );
    policy::verify_restrictions(config).unwrap();
}

#[test]
#[ignore = "requires installed Codex; probes sandbox using only temporary files, no generation"]
fn named_profile_restricts_reads_and_writes_to_controlled_paths() {
    let directory = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let allowed = directory.path().join("allowed.txt");
    let forbidden = outside.path().join("outside.txt");
    std::fs::write(&allowed, "allowed-fixture").unwrap();
    std::fs::write(&forbidden, "outside-fixture").unwrap();
    let mut peer = start(directory.path(), None);
    let original = peer
        .call(2, "config/read", json!({"includeLayers":false}))
        .unwrap();
    let restriction =
        profile::RestrictedProfile::new(&original["config"], directory.path()).unwrap();
    peer.close().unwrap();
    let mut peer = start(directory.path(), Some(&restriction.config));
    verify_controlled_files(
        &mut peer,
        directory.path(),
        &restriction.name,
        &allowed,
        &forbidden,
    );
    let models = peer
        .call(5, "model/list", json!({"includeHidden":false}))
        .unwrap();
    let mut catalog = Catalog::default();
    catalog.append(models).unwrap();
    let docreview_core::domain::provider::ProviderModel::Codex { model, .. } =
        catalog.default_model().unwrap()
    else {
        panic!("Codex model");
    };
    let thread = peer
        .call(
            6,
            "thread/start",
            restriction.thread_params(directory.path(), &model),
        )
        .unwrap();
    assert_eq!(thread["model"], model);
    assert_eq!(thread["modelProvider"], "openai");
    assert_eq!(thread["approvalPolicy"], "never");
    assert_eq!(thread["activePermissionProfile"]["id"], restriction.name);
    peer.close().unwrap();
}

fn verify_controlled_files(
    peer: &mut Peer,
    directory: &Path,
    name: &str,
    allowed: &Path,
    forbidden: &Path,
) {
    for (id, path, success) in [(2, allowed, true), (3, forbidden, false)] {
        let result = peer
            .call(
                id,
                "command/exec",
                json!({
            "command":["/bin/cat",path],"cwd":directory,"permissionProfile":name,"timeoutMs":3000}),
            )
            .unwrap();
        assert_eq!(result["exitCode"] == 0, success, "restricted read result");
    }
    let target = directory.join("not-created.txt");
    let result=peer.call(4,"command/exec",json!({
        "command":["/usr/bin/touch",target],"cwd":directory,"permissionProfile":name,"timeoutMs":3000})).unwrap();
    assert_ne!(result["exitCode"], 0);
    assert!(!target.exists());
}

#[test]
#[ignore = "uses current ChatGPT quota with a synthetic EXPLAIN request; no personal documents"]
fn managed_chatgpt_generates_a_structured_explanation_without_claude() {
    use docreview_core::{
        codex_adapter::client::{Client, TurnInput},
        domain::ai::{AiResponse, ResponseMode},
    };
    let directory = tempfile::tempdir().unwrap();
    let spec = ProcessSpec {
        program: std::env::var_os("DOCREVIEW_CODEX_BIN")
            .expect("explicit Codex binary")
            .into(),
        args: vec![],
        directory: directory.path().to_owned(),
        timeout: Duration::from_secs(120),
        environment: ["HOME", "PATH", "CODEX_HOME", "TMPDIR", "LANG"]
            .into_iter()
            .filter_map(|key| std::env::var_os(key).map(|value| (key.into(), value)))
            .collect(),
    };
    let cancelled = Arc::new(AtomicBool::new(false));
    let mut client = Client::connect(&spec, directory.path(), cancelled.clone()).unwrap();
    let model = client.catalog.default_model().unwrap();
    let result=client.generate(directory.path(),TurnInput {model:&model,session:None,mode:ResponseMode::Explain,
        input:"Return only JSON: schema_version 1, mode EXPLAIN, answer connected. Do not call tools."},&cancelled);
    client.close().unwrap();
    assert!(
        matches!(result.unwrap().response,AiResponse::Explain {answer,..} if !answer.is_empty())
    );
}
