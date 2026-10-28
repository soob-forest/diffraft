use docreview_core::{claude_adapter::profile, domain::connection::ConnectionStatus};
use serde_json::{Value, json};

fn status(plan: Value) -> ConnectionStatus {
    let payload = json!({"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty","subscriptionType":plan});
    profile::authentication(Some(0), &serde_json::to_vec(&payload).unwrap(), false)
}

#[test]
fn official_individual_and_shared_subscriptions_are_accepted() {
    for plan in ["pro", "max", "team", "enterprise"] {
        assert_eq!(status(json!(plan)), ConnectionStatus::Ready, "{plan}");
    }
}

#[test]
fn unknown_free_and_malformed_subscriptions_are_not_accepted() {
    for plan in [
        json!("free"),
        json!("unknown"),
        json!(""),
        Value::Null,
        json!(false),
        json!([]),
    ] {
        assert_eq!(status(plan), ConnectionStatus::AuthRouteMismatch);
    }
}
