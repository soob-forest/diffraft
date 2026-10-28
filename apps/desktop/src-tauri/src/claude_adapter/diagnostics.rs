use super::{
    discovery,
    environment::CliEnvironment,
    process::{ProcessOutput, ProcessSpec, run},
    profile,
};
use crate::domain::{
    connection::{ConnectionReport, ConnectionStatus},
    error::{AppError, ErrorCode},
};
use std::{
    path::Path,
    sync::{Arc, atomic::AtomicBool},
};

pub fn inspect(
    path: &Path,
    directory: &Path,
    environment: &CliEnvironment,
) -> Result<ConnectionReport, AppError> {
    let program = discovery::executable(path)?;
    discovery::verify_signature(&program, directory, environment)?;
    let version = diagnostic(&program, directory, environment, &["--version"])?;
    let version = version
        .status
        .success()
        .then(|| profile::version(&version.stdout))
        .flatten();
    let compatible = if version.as_deref().is_some_and(profile::meets_minimum) {
        option_status(
            &program,
            directory,
            environment,
            version.as_deref().expect("checked version"),
        )?
    } else {
        ConnectionStatus::Unsupported
    };
    let status = if compatible == ConnectionStatus::Ready {
        authentication(&program, directory, environment)?
    } else {
        compatible
    };
    Ok(profile::report(
        status,
        Some(program.to_string_lossy().into_owned()),
        version,
    ))
}

fn authentication(
    program: &Path,
    directory: &Path,
    environment: &CliEnvironment,
) -> Result<ConnectionStatus, AppError> {
    if environment.overridden {
        return Ok(ConnectionStatus::AuthRouteMismatch);
    }
    let auth = diagnostic(
        program,
        directory,
        environment,
        &["auth", "status", "--json"],
    )?;
    Ok(profile::authentication(
        auth.status.code(),
        &auth.stdout,
        false,
    ))
}

fn option_status(
    program: &Path,
    directory: &Path,
    environment: &CliEnvironment,
    version: &str,
) -> Result<ConnectionStatus, AppError> {
    let help = diagnostic(program, directory, environment, &["--help"])?;
    if !help.status.success() {
        return Ok(ConnectionStatus::DiagnosticFailed);
    }
    if profile::supports(version, &help.stdout) {
        return Ok(ConnectionStatus::Ready);
    }
    let args = profile::arguments(
        crate::domain::ai::ResponseMode::Explain,
        Some(profile::OPTION_PROBE_SESSION),
    )?;
    let borrowed: Vec<_> = args
        .iter()
        .map(|value| value.to_str().expect("UTF-8 CLI args"))
        .collect();
    let probe = diagnostic(program, directory, environment, &borrowed)?;
    if profile::accepted_option_probe(probe.status.code(), &probe.stdout, &probe.stderr) {
        return Ok(ConnectionStatus::Ready);
    }
    let unsupported = std::str::from_utf8(&probe.stderr).is_ok_and(|message| {
        message.starts_with("error: unknown option '") || message.starts_with("error: option '")
    });
    Ok(if unsupported {
        ConnectionStatus::Unsupported
    } else {
        ConnectionStatus::DiagnosticFailed
    })
}

fn diagnostic(
    program: &Path,
    directory: &Path,
    environment: &CliEnvironment,
    args: &[&str],
) -> Result<ProcessOutput, AppError> {
    let spec = ProcessSpec {
        program: program.into(),
        args: args.iter().map(Into::into).collect(),
        directory: directory.into(),
        environment: environment.values.clone(),
        timeout: discovery::DIAGNOSTIC_TIMEOUT,
    };
    let output = run(&spec, b"", Arc::new(AtomicBool::new(false)))?;
    if output.stdout.len() + output.stderr.len() > profile::DIAGNOSTIC_BYTES {
        return Err(AppError::new(
            ErrorCode::CliUnsupported,
            "CLI 진단 응답이 허용 크기를 초과했습니다.",
        ));
    }
    Ok(output)
}

#[cfg(test)]
#[path = "diagnostics_tests.rs"]
mod tests;
