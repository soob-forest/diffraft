use crate::domain::{
    MAX_RESPONSE_BYTES,
    error::{AppError, ErrorCode},
    provider::validate_provider_id,
};
use serde_json::{Value, json};

const MAX_METHOD_BYTES: usize = 128;
const INVALID_REQUEST_CODE: i64 = -32600;
const MISSING_THREAD_PREFIX: &str = "no rollout found for thread id ";

#[derive(Debug, PartialEq)]
pub enum Message {
    Result {
        id: u64,
        value: Value,
    },
    Error {
        id: u64,
        code: i64,
        thread_missing: bool,
    },
    Notification {
        method: String,
        params: Value,
    },
    ServerRequest {
        id: Value,
        method: String,
        params: Value,
    },
}

#[derive(Default)]
pub struct Decoder {
    pending: Vec<u8>,
    received: usize,
    failed: bool,
}

impl Decoder {
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<Message>, AppError> {
        if self.failed {
            return Err(invalid());
        }
        self.received = self.received.saturating_add(chunk.len());
        if self.received > MAX_RESPONSE_BYTES {
            self.failed = true;
            return Err(invalid());
        }
        self.pending.extend_from_slice(chunk);
        let result = self.decode_lines();
        if result.is_err() {
            self.failed = true;
        }
        result
    }

    fn decode_lines(&mut self) -> Result<Vec<Message>, AppError> {
        let mut messages = Vec::new();
        let mut consumed = 0;
        for (index, byte) in self.pending.iter().enumerate() {
            if *byte != b'\n' {
                continue;
            }
            let value =
                serde_json::from_slice(&self.pending[consumed..index]).map_err(|_| invalid())?;
            messages.push(parse(value)?);
            consumed = index + 1;
        }
        self.pending.drain(..consumed);
        Ok(messages)
    }

    pub fn finish(&self) -> Result<(), AppError> {
        if self.failed || !self.pending.is_empty() {
            return Err(invalid());
        }
        Ok(())
    }
}

pub fn request(id: u64, method: &str, params: Value) -> Result<Vec<u8>, AppError> {
    if !valid_method(method) || !params.is_object() {
        return Err(invalid());
    }
    let mut bytes = serde_json::to_vec(&json!({"id": id, "method": method, "params": params}))
        .map_err(|_| invalid())?;
    if bytes.len() >= MAX_RESPONSE_BYTES {
        return Err(invalid());
    }
    bytes.push(b'\n');
    Ok(bytes)
}

pub fn response(message: Message, expected_id: u64) -> Result<Value, AppError> {
    match message {
        Message::Result { id, value } if id == expected_id => Ok(value),
        Message::Error { id, .. } if id == expected_id => Err(AppError::new(
            ErrorCode::CliUnsupported,
            "Codex 요청을 처리할 수 없습니다. 버전과 연결 상태를 확인해 주세요.",
        )),
        _ => Err(invalid()),
    }
}

fn parse(value: Value) -> Result<Message, AppError> {
    let object = value.as_object().ok_or_else(invalid)?;
    if let Some(method) = object.get("method") {
        if object.contains_key("result") || object.contains_key("error") {
            return Err(invalid());
        }
        let method = method
            .as_str()
            .filter(|v| valid_method(v))
            .ok_or_else(invalid)?;
        let params = object.get("params").cloned().unwrap_or(Value::Null);
        return match object.get("id") {
            Some(id) if valid_server_id(id) => Ok(Message::ServerRequest {
                id: id.clone(),
                method: method.into(),
                params,
            }),
            Some(_) => Err(invalid()),
            None => Ok(Message::Notification {
                method: method.into(),
                params,
            }),
        };
    }
    let id = object
        .get("id")
        .and_then(Value::as_u64)
        .ok_or_else(invalid)?;
    match (object.get("result"), object.get("error")) {
        (Some(value), None) => Ok(Message::Result {
            id,
            value: value.clone(),
        }),
        (None, Some(error)) => Ok(Message::Error {
            id,
            code: error
                .get("code")
                .and_then(Value::as_i64)
                .ok_or_else(invalid)?,
            thread_missing: missing_thread(error),
        }),
        _ => Err(invalid()),
    }
}

fn missing_thread(error: &Value) -> bool {
    // Codex 0.165.0 has no structured missing-thread error data. Discard raw text.
    error["code"] == INVALID_REQUEST_CODE
        && error["message"]
            .as_str()
            .and_then(|message| message.strip_prefix(MISSING_THREAD_PREFIX))
            .is_some_and(|thread| validate_provider_id(thread).is_ok())
}

fn valid_method(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_METHOD_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"/_".contains(&byte))
}

fn valid_server_id(value: &Value) -> bool {
    value.as_u64().is_some()
        || value.as_str().is_some_and(|id| {
            !id.is_empty() && id.len() <= MAX_METHOD_BYTES && !id.chars().any(char::is_control)
        })
}

fn invalid() -> AppError {
    AppError::new(
        ErrorCode::OutputInvalid,
        "Codex 프로토콜 응답이 올바르지 않습니다.",
    )
}
