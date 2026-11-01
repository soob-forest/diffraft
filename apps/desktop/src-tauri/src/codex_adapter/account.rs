use crate::domain::error::{AppError, ErrorCode};
use serde_json::Value;
use sha2::{Digest, Sha256};

const MAX_IDENTITY_BYTES: usize = 1024;

/// Opaque account/workspace scope; never persist the raw email or credentials.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountScope(pub String);

pub fn chatgpt_scope(value: &Value) -> Result<AccountScope, AppError> {
    let account = &value["account"];
    if account.is_null() {
        return Err(AppError::new(
            ErrorCode::AuthRequired,
            "Codex에서 ChatGPT 계정으로 로그인해 주세요.",
        ));
    }
    if account["type"] != "chatgpt" || value["requiresOpenaiAuth"] != true {
        return Err(mismatch());
    }
    let email = identity(&account["email"])?;
    let routing = &value["workspaceRouting"];
    let workspace = identity(&routing["chatgptAccountId"])?;
    if !routing["backendOrigin"]
        .as_str()
        .is_some_and(super::policy::official_chatgpt_origin)
    {
        return Err(mismatch());
    }
    let mut hash = Sha256::new();
    for part in ["docreview-codex-account-v1", email, workspace] {
        hash.update((part.len() as u64).to_be_bytes());
        hash.update(part.as_bytes());
    }
    let digest = hash
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    Ok(AccountScope(digest))
}

fn identity(value: &Value) -> Result<&str, AppError> {
    value
        .as_str()
        .filter(|text| {
            !text.trim().is_empty()
                && text.len() <= MAX_IDENTITY_BYTES
                && !text.chars().any(char::is_control)
        })
        .ok_or_else(mismatch)
}

fn mismatch() -> AppError {
    AppError::new(
        ErrorCode::AuthRequired,
        "Codex의 ChatGPT 계정과 워크스페이스를 확인할 수 없습니다. 인증 경로를 확인해 주세요.",
    )
}
