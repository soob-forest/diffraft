//! No credentials or quota: observe native App Server requests at a loopback stub.
#[path = "support/codex_inference.rs"]
mod fixture;
use docreview_core::codex_adapter::{policy, profile::RestrictedProfile, protocol::Message};
use serde_json::{Value, json};
use std::path::PathBuf;

const MARKER: &str = "DOCREVIEW_EXTERNAL_BASE_81027";
struct Probe {
    _root: tempfile::TempDir,
    home: PathBuf,
    work: PathBuf,
    config: Value,
}
struct CapturedTurn {
    thread: String,
    body: Value,
    base: Option<String>,
}

impl Probe {
    fn new(key: &str) -> Self {
        let root = tempfile::tempdir().unwrap();
        let home = root.path().join("home");
        let work = root.path().join("work");
        std::fs::create_dir(&home).unwrap();
        std::fs::create_dir(&work).unwrap();
        let instruction = root.path().join("synthetic-system.txt");
        std::fs::write(&instruction, MARKER).unwrap();
        std::fs::write(
            home.join("config.toml"),
            format!("{key}={}\n", json!(instruction)),
        )
        .unwrap();
        let work = work.canonicalize().unwrap();
        let mut bootstrap = fixture::peer(&home, &work, &policy::restrictions(&json!({})).unwrap());
        let original = bootstrap
            .call(2, "config/read", json!({"includeLayers":false}))
            .unwrap();
        bootstrap.close().unwrap();
        Self {
            _root: root,
            home,
            work,
            config: original["config"].clone(),
        }
    }

    fn turn(&self, resume: Option<&str>, legacy: bool) -> CapturedTurn {
        let restriction = RestrictedProfile::new(&self.config, &self.work).unwrap();
        let (config, listener) = fixture::inference(&restriction.config);
        let mut peer = fixture::peer(&self.home, &self.work, &config);
        let mut params = restriction.thread_params(&self.work, "fixture-model");
        params["modelProvider"] = json!("fixture");
        params["config"] = config;
        params["developerInstructions"] = json!("DocReview uses only supplied context. No tools.");
        if legacy {
            params.as_object_mut().unwrap().remove("baseInstructions");
        }
        let base = params["baseInstructions"].as_str().map(String::from);
        let method = if let Some(thread) = resume {
            params["threadId"] = json!(thread);
            params["excludeTurns"] = json!(true);
            "thread/resume"
        } else {
            "thread/start"
        };
        let result = peer.call(2, method, params).unwrap();
        assert!(
            result["instructionSources"]
                .as_array()
                .is_some_and(Vec::is_empty)
        );
        let thread = result["thread"]["id"].as_str().unwrap().to_owned();
        peer.call(3,"turn/start",json!({"threadId":thread,"input":[{"type":"text","text":"Return connected without tools."}],"permissions":restriction.name,"approvalPolicy":"never"})).unwrap();
        let body = listener.join().unwrap();
        loop {
            let message = peer.receive().unwrap();
            if matches!(message, Message::Notification {ref method,..} if method=="turn/completed")
            {
                break;
            }
        }
        peer.close().unwrap();
        CapturedTurn { thread, body, base }
    }
}

fn assert_isolated(turn: &CapturedTurn) {
    let payload = serde_json::to_string(&turn.body).unwrap();
    assert!(
        !payload.contains(MARKER),
        "inherited base instructions reached inference"
    );
    let base = turn
        .base
        .as_ref()
        .expect("app-owned base instructions required");
    assert!(!base.is_empty());
    assert!(
        payload.contains(base),
        "app-owned instructions were not transmitted"
    );
}

#[test]
#[ignore = "installed CLI; temporary home and loopback stub only, no account"]
fn fresh_threads_exclude_configured_base_instruction_files_and_legacy_alias() {
    for key in ["model_instructions_file", "experimental_instructions_file"] {
        assert_isolated(&Probe::new(key).turn(None, false));
    }
}

#[test]
#[ignore = "installed CLI; temporary legacy thread and loopback stub only, no account"]
fn resumed_legacy_thread_replaces_persisted_custom_base_instructions() {
    let probe = Probe::new("model_instructions_file");
    let legacy = probe.turn(None, true);
    assert!(
        serde_json::to_string(&legacy.body)
            .unwrap()
            .contains(MARKER)
    );
    let resumed = probe.turn(Some(&legacy.thread), false);
    assert_eq!(resumed.thread, legacy.thread);
    assert_isolated(&resumed);
}
