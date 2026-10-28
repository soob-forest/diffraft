use crate::domain::{
    document::validate_id,
    error::{AppError, ErrorCode},
};
use serde_json::Value;

pub(super) fn classify(value: Option<&Value>, stderr: &[u8]) -> AppError {
    let diagnostic = std::str::from_utf8(stderr).unwrap_or("").trim();
    if diagnostic
        .strip_prefix("No conversation found with session ID: ")
        .is_some_and(|id| validate_id(id).is_ok())
    {
        return error(ErrorCode::SessionMissing);
    }
    if diagnostic.starts_with("Error: --json-schema is not a valid JSON Schema")
        || diagnostic.starts_with("error: unknown option '")
        || diagnostic.starts_with("error: option '")
    {
        return error(ErrorCode::CliUnsupported);
    }
    if let Some(value) = value.filter(|v| v["type"] == "result" && v["is_error"] == true) {
        if value["subtype"] == "error_max_structured_output_retries" {
            return error(ErrorCode::OutputInvalid);
        }
        if let Some(code) = value["result"].as_str().and_then(known_message) {
            return error(code);
        }
        if let Some(errors) = value["errors"].as_array() {
            for message in errors.iter().filter_map(Value::as_str) {
                if let Some(code) = known_message(message) {
                    return error(code);
                }
            }
        }
    }
    error(ErrorCode::UnknownError)
}

fn known_message(message: &str) -> Option<ErrorCode> {
    if message.starts_with("Not logged in") || message.starts_with("Authentication required") {
        return Some(ErrorCode::AuthRequired);
    }
    if message.starts_with("API Error: Connection error.")
        || message.starts_with("Unable to connect to API")
    {
        return Some(ErrorCode::NetworkError);
    }
    if message.starts_with("Prompt is too long") {
        return Some(ErrorCode::ContextTooLarge);
    }
    match message
        .strip_prefix("API Error: ")
        .and_then(|text| text.split_whitespace().next())
    {
        Some("401") => Some(ErrorCode::AuthRequired),
        Some("403" | "429") => Some(ErrorCode::RateOrPolicy),
        Some("500" | "502" | "503" | "504" | "529") => Some(ErrorCode::NetworkError),
        _ => None,
    }
}

fn error(code: ErrorCode) -> AppError {
    let message = match code {
        ErrorCode::OutputInvalid => {
            "AI가 응답을 올바른 형식으로 만들지 못했습니다. 기존 내용은 보존했습니다. 다시 요청해 주세요."
        }
        ErrorCode::SessionMissing => {
            "이전 CLI 대화를 찾을 수 없습니다. 대화와 후보는 로컬에 보존했습니다. 다시 요청하면 로컬 맥락으로 새 세션을 시작합니다."
        }
        ErrorCode::CliUnsupported => {
            "CLI가 요청 형식을 지원하지 않습니다. 연결 진단과 지원 버전을 확인해 주세요."
        }
        ErrorCode::AuthRequired => {
            "공식 CLI 로그인이 필요합니다. 연결 설정에서 로그인한 뒤 다시 요청해 주세요."
        }
        ErrorCode::RateOrPolicy => {
            "CLI가 접근 권한 또는 사용 한도 제한을 보고했습니다. 계정의 이용 정책과 한도를 확인한 뒤 다시 요청해 주세요."
        }
        ErrorCode::NetworkError => {
            "CLI 연결 또는 서비스 오류입니다. 요청이 처리됐을 수 있으므로 사용 한도를 확인하고 직접 재시도해 주세요."
        }
        ErrorCode::ContextTooLarge => {
            "모델이 요청 맥락 크기를 초과했다고 보고했습니다. 범위를 줄이거나 새 작업으로 나누어 주세요."
        }
        _ => {
            "CLI 요청에 실패했으며 정확한 원인을 확인할 수 없습니다. 이전 후보를 유지했습니다. 연결 진단 후 다시 요청해 주세요."
        }
    };
    AppError::new(code, message)
}
