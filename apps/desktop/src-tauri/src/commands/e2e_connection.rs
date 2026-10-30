use crate::{
    claude_adapter::{coordinator::Coordinator, guarded_process, profile, result},
    domain::{
        connection::{ConnectionAction, ConnectionReport, ConnectionStatus},
        error::{AppError, ErrorCode},
    },
    storage::Store,
};
use std::{fs, sync::Arc};

// E2E-only substitute for the external CLI diagnostic/auth boundary, never the store or IPC.
pub fn dispatch(
    store: &Store,
    coordinator: &Arc<Coordinator>,
    action: ConnectionAction,
) -> Result<ConnectionReport, AppError> {
    let root = store
        .directory()
        .parent()
        .ok_or_else(|| AppError::invalid("테스트 경로가 없습니다."))?;
    let mode = match fs::read_to_string(root.join("next-connection")) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => "MISSING".into(),
        Err(_) => return Err(AppError::invalid("가짜 진단 상태를 읽을 수 없습니다.")),
    };
    let status = match mode.as_str() {
        "READY" => ConnectionStatus::Ready,
        "AUTH_REQUIRED" => ConnectionStatus::AuthRequired,
        "UNSUPPORTED" | "TOO_OLD" => ConnectionStatus::Unsupported,
        "MISSING" => ConnectionStatus::Missing,
        _ => {
            return Err(AppError::invalid(
                "등록된 가짜 진단 상태만 사용할 수 있습니다.",
            ));
        }
    };
    let mut report = profile::report(
        status,
        Some("/synthetic/claude".into()),
        Some(
            if mode == "TOO_OLD" {
                "2.1.294"
            } else {
                "2.1.312"
            }
            .into(),
        ),
    );
    if let ConnectionAction::Test { operation_id } | ConnectionAction::Login { operation_id } =
        action
    {
        let guard = coordinator.begin(&operation_id)?;
        if status != ConnectionStatus::Ready {
            return Err(AppError::new(ErrorCode::AuthRequired, &report.message));
        }
        let model = crate::claude_adapter::model_settings::load(store.directory())?;
        let mut spec = super::e2e_generation::spec()?;
        spec.args.extend(profile::model_arguments(
            crate::domain::ai::ResponseMode::Explain,
            None,
            model,
        )?);
        report.tested_model = Some(model);
        let output = guarded_process::run(
            &spec,
            br#"{"schemaVersion":1}"#,
            guard.cancelled.clone(),
            store.directory(),
        )?;
        result::response(&output)?;
        report.message = "연결 테스트에 성공했습니다. 문서를 전송하지 않은 최소 요청과 응답 검증을 완료했습니다.".into();
    }
    Ok(report)
}
