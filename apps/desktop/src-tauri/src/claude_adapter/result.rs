use super::process::ProcessOutput;
use crate::domain::{
    ai::AiResponse,
    document::validate_id,
    error::{AppError, ErrorCode},
};

pub fn response(output: &ProcessOutput) -> Result<AiResponse, AppError> {
    completion(output).map(|value| value.response)
}

pub struct AiCompletion {
    pub response: AiResponse,
    pub session_id: String,
}

pub fn completion(output: &ProcessOutput) -> Result<AiCompletion, AppError> {
    if output.stdout.len().saturating_add(output.stderr.len()) > crate::domain::MAX_RESPONSE_BYTES {
        return Err(invalid());
    }
    let parsed = serde_json::from_slice::<serde_json::Value>(&output.stdout);
    if !output.status.success() {
        return Err(super::failure::classify(
            parsed.as_ref().ok(),
            &output.stderr,
        ));
    }
    let value = parsed.map_err(|_| invalid())?;
    if value["type"] == "result" && value["is_error"] == true {
        return Err(super::failure::classify(Some(&value), &output.stderr));
    }
    if value["type"] != "result" || value["is_error"] != false || value["subtype"] != "success" {
        return Err(invalid());
    }
    let session_id = value["session_id"].as_str().ok_or_else(invalid)?;
    validate_id(session_id).map_err(|_| invalid())?;
    let bytes = serde_json::to_vec(&value["structured_output"]).map_err(|_| invalid())?;
    Ok(AiCompletion {
        response: AiResponse::parse(&bytes)?,
        session_id: session_id.into(),
    })
}
fn invalid() -> AppError {
    AppError::new(
        ErrorCode::OutputInvalid,
        "CLI 응답 형식을 확인할 수 없습니다. 이전 후보를 유지했습니다.",
    )
}
