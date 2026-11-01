use super::protocol::{self, Message};
use crate::domain::{
    ai::AiResponse,
    error::{AppError, ErrorCode},
    provider::validate_provider_id,
};
use serde_json::Value;

pub struct Turn {
    thread: String,
    request: u64,
    turn: Option<String>,
    acknowledged: bool,
    completed: bool,
    final_message: Option<(String, String)>,
}

impl Turn {
    pub fn new(thread: &str, request: u64) -> Self {
        Self {
            thread: thread.into(),
            request,
            turn: None,
            acknowledged: false,
            completed: false,
            final_message: None,
        }
    }
    pub fn id(&self) -> Option<&str> {
        self.turn.as_deref()
    }

    pub fn push(&mut self, message: Message) -> Result<Option<AiResponse>, AppError> {
        if self.completed && self.acknowledged {
            return Err(invalid());
        }
        match message {
            Message::Result { id, value } if id == self.request && !self.acknowledged => {
                self.bind(&value["turn"]["id"])?;
                self.acknowledged = true;
            }
            Message::Notification { method, params } => self.notification(&method, &params)?,
            message => {
                protocol::response(message, self.request)?;
                return Err(invalid());
            }
        }
        if !self.completed || !self.acknowledged {
            return Ok(None);
        }
        let (_, text) = self.final_message.as_ref().ok_or_else(invalid)?;
        AiResponse::parse(text.as_bytes()).map(Some)
    }

    fn notification(&mut self, method: &str, params: &Value) -> Result<(), AppError> {
        if !params["threadId"].is_null() && params["threadId"] != self.thread {
            return Err(invalid());
        }
        if (method.starts_with("item/") || method.starts_with("turn/"))
            && let Some(id) = params["turnId"].as_str()
        {
            self.bind(&Value::String(id.into()))?;
        }
        match method {
            "turn/started" => self.bind(&params["turn"]["id"]),
            "item/started" | "item/completed" => {
                if params["threadId"] != self.thread {
                    return Err(invalid());
                }
                self.bind(&params["turnId"])?;
                self.item(&params["item"], method == "item/completed")
            }
            "turn/completed" => {
                if params["threadId"] != self.thread {
                    return Err(invalid());
                }
                self.bind(&params["turn"]["id"])?;
                if params["turn"]["status"] != "completed" || !params["turn"]["error"].is_null() {
                    return Err(turn_error(&params["turn"]));
                }
                if let Some(items) = params["turn"]["items"].as_array() {
                    for item in items {
                        self.item(item, true)?;
                    }
                }
                self.completed = true;
                Ok(())
            }
            "error" => Err(turn_error(params)),
            "model/rerouted" => Err(invalid()),
            _ => Ok(()),
        }
    }

    fn bind(&mut self, id: &Value) -> Result<(), AppError> {
        let id = id.as_str().ok_or_else(invalid)?;
        validate_provider_id(id).map_err(|_| invalid())?;
        if self.turn.as_deref().is_some_and(|expected| expected != id) {
            return Err(invalid());
        }
        self.turn = Some(id.into());
        Ok(())
    }

    fn item(&mut self, item: &Value, completed: bool) -> Result<(), AppError> {
        match item["type"].as_str() {
            Some("userMessage" | "reasoning") => Ok(()),
            Some("agentMessage") => {
                if !completed || item["phase"] == "commentary" {
                    return Ok(());
                }
                let id = item["id"].as_str().ok_or_else(invalid)?;
                let text = item["text"].as_str().ok_or_else(invalid)?;
                let candidate = (id.to_owned(), text.to_owned());
                if self
                    .final_message
                    .as_ref()
                    .is_some_and(|previous| previous != &candidate)
                {
                    return Err(invalid());
                }
                self.final_message = Some(candidate);
                Ok(())
            }
            _ => Err(AppError::new(
                ErrorCode::CliUnsupported,
                "Codex가 허용하지 않은 도구를 요청하여 생성을 중단했습니다.",
            )),
        }
    }
}

fn turn_error(value: &Value) -> AppError {
    let info = &value["error"]["codexErrorInfo"];
    let code = match info.as_str() {
        Some("unauthorized") => ErrorCode::AuthRequired,
        Some(
            "usageLimitExceeded"
            | "rateLimitExceeded"
            | "sessionBudgetExceeded"
            | "cyberPolicy"
            | "misalignmentPolicyViolation",
        ) => ErrorCode::RateOrPolicy,
        Some("contextWindowExceeded") => ErrorCode::ContextTooLarge,
        Some("modelNotFound") => ErrorCode::CliUnsupported,
        _ if value["status"] == "interrupted" => ErrorCode::Cancelled,
        _ => ErrorCode::NetworkError,
    };
    AppError::new(
        code,
        "Codex 생성을 완료하지 못했습니다. 인증·사용 한도와 연결 상태를 확인해 주세요. 이전 후보를 유지했습니다.",
    )
}
fn invalid() -> AppError {
    AppError::new(
        ErrorCode::OutputInvalid,
        "Codex 생성 이벤트나 최종 응답이 요청과 일치하지 않습니다.",
    )
}
