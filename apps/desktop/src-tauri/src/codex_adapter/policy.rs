use crate::domain::error::{AppError, ErrorCode};
use serde_json::{Map, Value, json};

pub const DISABLED_FEATURES: &[&str] = &[
    "shell_tool",
    "shell_snapshot",
    "apps",
    "plugins",
    "hooks",
    "browser_use",
    "computer_use",
    "multi_agent",
    "multi_agent_v2",
    "view_image",
    "skill_search",
    "tool_suggest",
    "memories",
    "code_mode",
    "code_mode_host",
    "js_repl",
    "image_generation",
    "browser_use_external",
    "browser_use_full_cdp_access",
    "artifact",
    "in_app_local_automation",
    "in_app_browser",
    "multi_env_copy_file",
    "workspace_dependencies",
    "skill_mcp_dependency_install",
    "request_permissions_tool",
    "unified_exec",
    "goals",
    "sleep_tool",
];
const MAX_MCP_SERVERS: usize = 128;
const MAX_SERVER_NAME_BYTES: usize = 256;

/// Per-invocation overrides, never written to the user's configuration.
pub fn restrictions(config: &Value) -> Result<Value, AppError> {
    require_chatgpt_route(config)?;
    let mut features = Map::new();
    for feature in DISABLED_FEATURES {
        features.insert((*feature).into(), false.into());
    }
    features.insert("skip_host_skill_discovery".into(), true.into());
    let mut servers = Map::new();
    for name in mcp_servers(config)?.keys() {
        if name.is_empty()
            || name.len() > MAX_SERVER_NAME_BYTES
            || name.chars().any(char::is_control)
        {
            return Err(unsafe_config());
        }
        servers.insert(name.clone(), json!({"enabled":false}));
    }
    Ok(
        json!({"features":features,"mcp_servers":servers,"web_search":"disabled",
        "approval_policy":"never","sandbox_mode":"read-only","notify":[],
        "project_doc_max_bytes":0,"allow_login_shell":false}),
    )
}

/// Validate the effective merged configuration, not just the requested overrides.
pub fn verify_restrictions(config: &Value) -> Result<(), AppError> {
    require_chatgpt_route(config)?;
    if DISABLED_FEATURES
        .iter()
        .any(|name| config["features"][name] != false)
        || config["features"]["skip_host_skill_discovery"] != true
        || mcp_servers(config)?
            .values()
            .any(|entry| entry["enabled"] != false)
        || config["web_search"] != "disabled"
        || config["approval_policy"] != "never"
        || config["sandbox_mode"] != "read-only"
        || config["allow_login_shell"] != false
        || config["project_doc_max_bytes"] != 0
        || config["notify"] != json!([])
    {
        return Err(unsafe_config());
    }
    Ok(())
}

fn mcp_servers(config: &Value) -> Result<Map<String, Value>, AppError> {
    match config.get("mcp_servers") {
        None | Some(Value::Null) => Ok(Map::new()),
        Some(Value::Object(servers)) if servers.len() <= MAX_MCP_SERVERS => Ok(servers.clone()),
        _ => Err(unsafe_config()),
    }
}

fn require_chatgpt_route(config: &Value) -> Result<(), AppError> {
    if !config.is_object() {
        return Err(unsafe_config());
    }
    if !config["openai_base_url"].is_null() {
        return Err(unsafe_config());
    }
    if !config["chatgpt_base_url"].is_null()
        && !config["chatgpt_base_url"]
            .as_str()
            .is_some_and(official_chatgpt_origin)
    {
        return Err(unsafe_config());
    }
    if !config["model_provider"].is_null() && config["model_provider"] != "openai" {
        return Err(unsafe_config());
    }
    if !config["model_providers"]["openai"].is_null()
        || (!config["forced_login_method"].is_null() && config["forced_login_method"] != "chatgpt")
    {
        return Err(unsafe_config());
    }
    Ok(())
}

pub(super) fn official_chatgpt_origin(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    url.scheme() == "https"
        && url.host_str() == Some("chatgpt.com")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && matches!(url.path().trim_end_matches('/'), "" | "/backend-api")
}

fn unsafe_config() -> AppError {
    AppError::new(
        ErrorCode::CliUnsupported,
        "Codex의 인증 경로 또는 실행 제한을 확인할 수 없습니다. 사용자 설정을 확인해 주세요.",
    )
}
