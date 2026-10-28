use crate::domain::ai::ResponseMode;

#[derive(Debug, Clone)]
pub struct ExecutionContext {
    pub mode: ResponseMode,
    pub requested_session_id: Option<String>,
    pub cwd: String,
    pub cli_version: String,
    pub retry_of: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SessionBinding {
    pub session_id: String,
    pub cwd: String,
    pub cli_version: String,
}

pub(super) fn mode_name(mode: ResponseMode) -> &'static str {
    match mode {
        ResponseMode::Patch => "PATCH",
        ResponseMode::Rewrite => "REWRITE",
        ResponseMode::Explain => "EXPLAIN",
    }
}
