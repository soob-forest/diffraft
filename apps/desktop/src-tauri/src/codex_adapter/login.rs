use super::{
    account::{AccountScope, chatgpt_scope},
    client::start,
    policy,
    protocol::Message,
};
use crate::{
    claude_adapter::process::ProcessSpec,
    domain::error::{AppError, ErrorCode},
};
use serde_json::json;
use std::{
    path::Path,
    sync::{Arc, atomic::AtomicBool},
};

pub fn login(
    spec: &ProcessSpec,
    directory: &Path,
    cancelled: Arc<AtomicBool>,
    open: impl FnOnce(&str) -> Result<(), AppError>,
) -> Result<AccountScope, AppError> {
    let mut peer = start(spec, directory, None, cancelled.clone())?;
    let config = peer.call(2, "config/read", json!({"includeLayers":false}))?;
    let restrictions = policy::restrictions(&config["config"])?;
    peer.close()?;
    let mut peer = start(spec, directory, Some(&restrictions), cancelled)?;
    let account = peer.call(2, "account/read", json!({"refreshToken":false}))?;
    if !account["account"].is_null() {
        let scope = chatgpt_scope(&account)?;
        peer.close()?;
        return Ok(scope);
    }
    let login = peer.call(3, "account/login/start", json!({"type":"chatgpt"}))?;
    let id = login["loginId"]
        .as_str()
        .filter(|v| !v.is_empty() && v.len() <= 256)
        .ok_or_else(failed)?;
    let address = login["authUrl"].as_str().ok_or_else(failed)?;
    validate_auth_url(address)?;
    open(address)?;
    loop {
        if let Message::Notification { method, params } = peer.receive()?
            && method == "account/login/completed"
        {
            if params["loginId"] != id || params["success"] != true {
                return Err(failed());
            }
            break;
        }
    }
    let scope = chatgpt_scope(&peer.call(4, "account/read", json!({"refreshToken":false}))?)?;
    peer.close()?;
    Ok(scope)
}

pub fn validate_auth_url(address: &str) -> Result<(), AppError> {
    let url = url::Url::parse(address).map_err(|_| failed())?;
    if address.len() > 8192
        || url.scheme() != "https"
        || !matches!(
            url.host_str(),
            Some("auth.openai.com" | "auth0.openai.com" | "chatgpt.com")
        )
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(failed());
    }
    Ok(())
}
fn failed() -> AppError {
    AppError::new(
        ErrorCode::AuthRequired,
        "Codex의 공식 ChatGPT 로그인을 완료하지 못했습니다. 연결 상태를 다시 확인해 주세요.",
    )
}
