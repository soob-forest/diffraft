use super::{
    catalog::Catalog,
    client::{Client, TurnInput},
    launch,
};
use crate::{
    domain::{
        ai::ResponseMode,
        codex::{CodexModelInfo, CodexReport},
        error::AppError,
        provider::{AiProvider, ProviderModel},
    },
    storage::Store,
};
use std::sync::{Arc, atomic::AtomicBool};

pub const DIAGNOSTIC_TASK: &str = "00000000-0000-4000-8000-000000000099";

pub fn inspect(
    store: &Store,
    test: bool,
    cancelled: Arc<AtomicBool>,
) -> Result<CodexReport, AppError> {
    let prefs = store.ai_preferences()?;
    let (spec, version) = launch::prepare(store, DIAGNOSTIC_TASK, cancelled.clone())?;
    let mut client = Client::connect(&spec, store.directory(), cancelled.clone())?;
    let result = (|| {
        let tested_model = if test {
            let selected = selected_model(&client.catalog, prefs.codex_model.as_ref())?;
            client.generate(&spec.directory,TurnInput {model:&selected,session:None,
                input:"Return a short EXPLAIN response with schema_version=1 and answer=connected. No tools.",mode:ResponseMode::Explain},&cancelled)?;
            Some(selected)
        } else {
            None
        };
        let models = client
            .catalog
            .visible()?
            .into_iter()
            .map(|m| CodexModelInfo {
                model: m.model.clone(),
                label: m.display_name.clone(),
                is_default: m.is_default,
                effort: m.default_reasoning_effort,
                supported_efforts: m
                    .supported_reasoning_efforts
                    .iter()
                    .map(|effort| effort.reasoning_effort)
                    .collect(),
            })
            .collect();
        Ok(CodexReport {
            executable: spec.program.to_string_lossy().into_owned(),
            version,
            account_scope: client.account.0.clone(),
            models,
            tested_model,
        })
    })();
    client.close()?;
    if result.is_ok() && store.ai_preferences()? != prefs {
        return Err(AppError::invalid(
            "연결 확인 중 설정이 변경되었습니다. 설정을 다시 열고 연결을 확인해 주세요.",
        ));
    }
    result
}

pub fn resolve(store: &Store, cancelled: Arc<AtomicBool>) -> Result<ProviderModel, AppError> {
    let prefs = store.ai_preferences()?;
    if prefs.provider == AiProvider::Claude {
        return Ok(crate::claude_adapter::model_settings::load(store.directory())?.into());
    }
    let (spec, _) = launch::prepare(store, DIAGNOSTIC_TASK, cancelled.clone())?;
    let mut client = Client::connect(&spec, store.directory(), cancelled)?;
    let result = selected_model(&client.catalog, prefs.codex_model.as_ref());
    client.close()?;
    result
}

fn selected_model(
    catalog: &Catalog,
    saved: Option<&ProviderModel>,
) -> Result<ProviderModel, AppError> {
    let model = match saved {
        Some(model) => model.clone(),
        None => catalog.default_model()?,
    };
    catalog.validate_choice(&model)?;
    Ok(model)
}
