use crate::{
    claude_adapter::process::ProcessSpec,
    domain::error::{AppError, ErrorCode},
};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};

const GUIDANCE_FILES: [&str; 2] = ["AGENTS.md", "AGENTS.override.md"];
const SANDBOX: &str = "/usr/bin/sandbox-exec";

pub fn isolate(spec: &ProcessSpec) -> Result<ProcessSpec, AppError> {
    let root = spec
        .environment
        .get(std::ffi::OsStr::new("CODEX_HOME"))
        .map(PathBuf::from)
        .or_else(|| {
            spec.environment
                .get(std::ffi::OsStr::new("HOME"))
                .map(|p| PathBuf::from(p).join(".codex"))
        })
        .filter(|p| p.is_absolute())
        .ok_or_else(unavailable)?;
    let policy = policy(&root, spec)?;
    let mut isolated = spec.clone();
    isolated.program = SANDBOX.into();
    isolated.args = vec![
        "-p".into(),
        policy.into(),
        spec.program.clone().into_os_string(),
    ];
    isolated.args.extend(spec.args.clone());
    Ok(isolated)
}

fn policy(root: &Path, spec: &ProcessSpec) -> Result<String, AppError> {
    let mut paths = BTreeSet::new();
    for name in GUIDANCE_FILES {
        add_paths(&mut paths, root.join(name), "literal")?;
    }
    add_paths(&mut paths, root.join("skills"), "subpath")?;
    add_paths(&mut paths, PathBuf::from("/etc/codex/skills"), "subpath")?;
    if let Some(home) = spec.environment.get(std::ffi::OsStr::new("HOME")) {
        add_paths(
            &mut paths,
            PathBuf::from(home).join(".agents/skills"),
            "subpath",
        )?;
    }
    let mut policy = String::from("(version 1)(allow default)");
    for (path, kind) in paths {
        let value = path
            .to_str()
            .filter(|p| !p.chars().any(char::is_control))
            .ok_or_else(unavailable)?;
        let quoted = serde_json::to_string(value).map_err(|_| unavailable())?;
        policy.push_str(&format!("(deny file-read* ({kind} {quoted}))"));
    }
    Ok(policy)
}

fn add_paths(
    paths: &mut BTreeSet<(PathBuf, &'static str)>,
    path: PathBuf,
    kind: &'static str,
) -> Result<(), AppError> {
    paths.insert((canonical_path(&path)?, kind));
    paths.insert((path, kind));
    Ok(())
}

fn canonical_path(path: &Path) -> Result<PathBuf, AppError> {
    match fs::canonicalize(path) {
        Ok(path) => Ok(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let parent = path
                .parent()
                .filter(|p| *p != path)
                .ok_or_else(unavailable)?;
            Ok(canonical_path(parent)?.join(path.file_name().ok_or_else(unavailable)?))
        }
        Err(_) => Err(unavailable()),
    }
}

fn unavailable() -> AppError {
    AppError::new(
        ErrorCode::CliUnsupported,
        "Codex 전역 지침을 격리할 수 없습니다. 홈 경로와 macOS 실행 권한을 확인해 주세요.",
    )
}
