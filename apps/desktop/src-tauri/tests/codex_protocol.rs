use docreview_core::{
    codex_adapter::{
        account::chatgpt_scope,
        protocol::{Decoder, Message, request, response},
    },
    domain::{MAX_RESPONSE_BYTES, error::ErrorCode},
};
use serde_json::json;

#[test]
fn fragmented_utf8_and_multiple_messages_decode_in_order() {
    let bytes =
        b"{\"id\":1,\"result\":{\"ready\":true}}\n{\"method\":\"turn/started\",\"params\":{}}\n";
    let mut decoder = Decoder::default();
    let mut messages = Vec::new();
    for byte in bytes {
        messages.extend(decoder.push(&[*byte]).unwrap());
    }
    assert_eq!(
        response(messages.remove(0), 1).unwrap(),
        json!({"ready":true})
    );
    assert!(
        matches!(&messages[0], Message::Notification { method, .. } if method == "turn/started")
    );
    decoder.finish().unwrap();
    let text = "{\"id\":2,\"result\":\"한글😀\"}\n";
    let mut decoder = Decoder::default();
    let mut decoded = Vec::new();
    for byte in text.as_bytes() {
        decoded.extend(decoder.push(&[*byte]).unwrap());
    }
    assert_eq!(response(decoded.remove(0), 2).unwrap(), json!("한글😀"));
}

#[test]
fn rejects_incomplete_oversized_invalid_and_ambiguous_frames() {
    for bytes in [
        b"{\n".as_slice(),
        b"null\n",
        b"\xff\n",
        b"{\"id\":1,\"result\":{},\"error\":{\"code\":1}}\n",
        b"{\"id\":1,\"method\":\"test\",\"result\":{}}\n",
        b"{\"id\":null,\"result\":{}}\n",
    ] {
        let mut decoder = Decoder::default();
        assert_eq!(
            decoder.push(bytes).unwrap_err().code,
            ErrorCode::OutputInvalid
        );
        assert!(decoder.push(b"{\"id\":1,\"result\":{}}\n").is_err());
    }
    let mut decoder = Decoder::default();
    decoder.push(b"{\"id\":1").unwrap();
    assert!(decoder.finish().is_err());
    assert!(
        Decoder::default()
            .push(&vec![b' '; MAX_RESPONSE_BYTES + 1])
            .is_err()
    );
}

#[test]
fn correlation_and_error_redaction_do_not_trust_server_text() {
    let mut decoder = Decoder::default();
    let message = decoder
        .push(b"{\"id\":2,\"result\":{}}\n")
        .unwrap()
        .remove(0);
    assert!(response(message, 1).is_err());
    let message = decoder.push(b"{\"id\":3,\"error\":{\"code\":-32602,\"message\":\"SECRET_FIXTURE\",\"data\":\"SECRET_FIXTURE\"}}\n").unwrap().remove(0);
    assert!(!format!("{message:?}").contains("SECRET_FIXTURE"));
    assert!(
        !response(message, 3)
            .unwrap_err()
            .message
            .contains("SECRET_FIXTURE")
    );
    let message = decoder.push(b"{\"id\":4,\"error\":{\"code\":-32600,\"message\":\"no rollout found for thread id SECRET_FIXTURE\"}}\n").unwrap().remove(0);
    assert!(!format!("{message:?}").contains("SECRET_FIXTURE"));
    assert!(matches!(
        message,
        Message::Error {
            thread_missing: true,
            ..
        }
    ));
}

#[test]
fn server_approval_requests_are_distinct_from_results() {
    let mut decoder = Decoder::default();
    let message = decoder.push(b"{\"id\":\"approval-1\",\"method\":\"item/commandExecution/requestApproval\",\"params\":{}}\n").unwrap().remove(0);
    assert!(matches!(message, Message::ServerRequest { .. }));
    assert!(response(message, 1).is_err());
    let encoded = request(1, "account/read", json!({"refreshToken":false})).unwrap();
    assert_eq!(encoded.last(), Some(&b'\n'));
    assert!(request(1, "bad\nmethod", json!({})).is_err());
    assert!(request(1, "account/read", json!([])).is_err());
}

fn account(email: &str, workspace: &str) -> serde_json::Value {
    json!({"account":{"type":"chatgpt","email":email,"planType":"fixture"},
        "requiresOpenaiAuth":true,"workspaceRouting":{
            "chatgptAccountId":workspace,"backendOrigin":"https://chatgpt.com"}})
}

#[test]
fn account_scope_changes_with_account_or_workspace_without_exposing_email() {
    let a = chatgpt_scope(&account("one@example.invalid", "workspace-one")).unwrap();
    assert_eq!(
        a,
        chatgpt_scope(&account("one@example.invalid", "workspace-one")).unwrap()
    );
    assert_ne!(
        a,
        chatgpt_scope(&account("two@example.invalid", "workspace-one")).unwrap()
    );
    assert_ne!(
        a,
        chatgpt_scope(&account("one@example.invalid", "workspace-two")).unwrap()
    );
    assert_eq!(a.0.len(), 64);
    assert!(!format!("{a:?}").contains("example.invalid"));
}

#[test]
fn api_key_missing_identity_and_custom_backend_fail_closed() {
    for value in [
        json!({"account":null}),
        json!({"account":{"type":"apiKey"}}),
        json!({"account":{"type":"chatgpt","email":"one@example.invalid"},"requiresOpenaiAuth":true}),
    ] {
        assert_eq!(
            chatgpt_scope(&value).unwrap_err().code,
            ErrorCode::AuthRequired
        );
    }
    let mut custom = account("one@example.invalid", "workspace-one");
    custom["workspaceRouting"]["backendOrigin"] = "https://example.invalid".into();
    assert!(chatgpt_scope(&custom).is_err());
    let mut key = account("one@example.invalid", "workspace-one");
    key["account"]["type"] = "apiKey".into();
    assert!(chatgpt_scope(&key).is_err());
}
