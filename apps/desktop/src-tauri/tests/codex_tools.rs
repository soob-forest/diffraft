//! Explicit native probe: synthetic home and loopback inference stub, no credentials or quota.
#[path = "support/codex_inference.rs"]
mod fixture;
use docreview_core::codex_adapter::profile::RestrictedProfile;
use fixture::{inference, peer};
use serde_json::{Value, json};

#[test]
#[ignore = "requires installed Codex; loopback inference stub only, no account or network service"]
fn app_server_offers_no_file_shell_web_or_external_service_tools() {
    let root = tempfile::tempdir().unwrap();
    let home = root.path().join("home");
    let work = root.path().join("work");
    std::fs::create_dir(&home).unwrap();
    std::fs::create_dir(&work).unwrap();
    let marker = root.path().join("not-executed");
    std::fs::write(home.join("config.toml"),format!("notify=[\"/usr/bin/touch\",{}]\n[mcp_servers.synthetic]\ncommand=\"/usr/bin/touch\"\nargs=[{}]\n",json!(marker),json!(marker))).unwrap();
    let directory = work.canonicalize().unwrap();
    let restriction =
        RestrictedProfile::new(&json!({"mcp_servers":{"synthetic":{}}}), &directory).unwrap();
    let (config, listener) = inference(&restriction.config);
    let mut peer = peer(&home, &directory, &config);
    let mut params = restriction.thread_params(&directory, "fixture-model");
    params["modelProvider"] = json!("fixture");
    params["config"] = config;
    let result = peer.call(2, "thread/start", params).unwrap();
    assert!(
        result["instructionSources"]
            .as_array()
            .is_some_and(Vec::is_empty)
    );
    peer.call(3,"turn/start",json!({"threadId":result["thread"]["id"],"input":[{"type":"text","text":"Return connected without tools."}],"permissions":restriction.name,"approvalPolicy":"never"})).unwrap();
    let body = listener.join().unwrap();
    peer.close().unwrap();
    let names = tool_names(&body["tools"]);
    assert!(
        names.iter().all(|name| name == "request_user_input"),
        "unexpected side-effect tool offered"
    );
    assert!(!marker.exists(), "notify or MCP executed");
}

fn tool_names(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items.iter().flat_map(tool_names).collect(),
        Value::Object(fields) => fields
            .iter()
            .flat_map(|(key, value)| {
                if key == "name" {
                    value.as_str().map(str::to_owned).into_iter().collect()
                } else {
                    tool_names(value)
                }
            })
            .collect(),
        _ => Vec::new(),
    }
}
