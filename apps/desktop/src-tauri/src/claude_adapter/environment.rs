use super::profile::{AUTH_OVERRIDE_KEYS, MAX_PATH_BYTES};
use crate::domain::error::{AppError, ErrorCode};
use std::{collections::BTreeMap, ffi::OsString, path::Path};

const FORWARDED: &[&str] = &[
    "HOME",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "USER",
    "LOGNAME",
    "CLAUDE_CONFIG_DIR",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "https_proxy",
    "http_proxy",
    "all_proxy",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
];
const SYSTEM_PATH: &str = "/usr/bin:/bin:/usr/sbin:/sbin";
const STRUCTURED_OUTPUT_ATTEMPTS: &str = "3";

pub struct CliEnvironment {
    pub values: BTreeMap<OsString, OsString>,
    pub overridden: bool,
}

pub fn current() -> Result<CliEnvironment, AppError> {
    filtered(&std::env::vars_os().collect())
}

pub fn filtered(source: &BTreeMap<OsString, OsString>) -> Result<CliEnvironment, AppError> {
    let home = source.get(&OsString::from("HOME")).ok_or_else(|| {
        AppError::new(
            ErrorCode::CliUnsupported,
            "사용자 홈 폴더를 확인할 수 없습니다.",
        )
    })?;
    validate_directory(home)?;
    if let Some(config) = source.get(&OsString::from("CLAUDE_CONFIG_DIR")) {
        validate_directory(config)?;
    }
    let mut values: BTreeMap<OsString, OsString> = FORWARDED
        .iter()
        .filter_map(|key| {
            source
                .get(&OsString::from(key))
                .map(|value| ((*key).into(), value.clone()))
        })
        .collect();
    values.insert("PATH".into(), SYSTEM_PATH.into());
    values.insert("DISABLE_AUTOUPDATER".into(), "1".into());
    values.insert("DISABLE_TELEMETRY".into(), "1".into());
    values.insert("DISABLE_ERROR_REPORTING".into(), "1".into());
    values.insert(
        "MAX_STRUCTURED_OUTPUT_RETRIES".into(),
        STRUCTURED_OUTPUT_ATTEMPTS.into(),
    );
    let overridden = AUTH_OVERRIDE_KEYS.iter().any(|key| {
        source
            .get(&OsString::from(key))
            .is_some_and(|value| !value.is_empty())
    });
    Ok(CliEnvironment { values, overridden })
}

fn validate_directory(value: &OsString) -> Result<(), AppError> {
    let path = Path::new(value);
    if !path.is_absolute() || path.to_str().is_none() || value.len() > MAX_PATH_BYTES {
        return Err(AppError::new(
            ErrorCode::CliUnsupported,
            "CLI의 홈 또는 설정 폴더는 UTF-8 절대 경로여야 합니다.",
        ));
    }
    Ok(())
}
