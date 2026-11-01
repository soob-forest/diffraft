use crate::domain::{
    error::{AppError, ErrorCode},
    provider::{ProviderModel, ReasoningEffort, validate_provider_id},
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashSet;

const MAX_MODELS: usize = 256;
const MAX_PAGES: usize = 16;
const MAX_CURSOR_BYTES: usize = 1024;
const MAX_DISPLAY_BYTES: usize = 256;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    pub id: String,
    pub model: String,
    pub display_name: String,
    pub hidden: bool,
    pub is_default: bool,
    pub default_reasoning_effort: ReasoningEffort,
    pub supported_reasoning_efforts: Vec<EffortOption>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffortOption {
    pub reasoning_effort: ReasoningEffort,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Page {
    data: Vec<Model>,
    next_cursor: Option<String>,
}

#[derive(Default)]
pub struct Catalog {
    models: Vec<Model>,
    cursors: HashSet<String>,
    pages: usize,
    complete: bool,
    failed: bool,
}

impl Catalog {
    pub fn append(&mut self, value: Value) -> Result<Option<String>, AppError> {
        if self.failed || self.complete {
            return Err(invalid());
        }
        let result = self.append_page(value);
        if result.is_err() {
            self.failed = true;
        }
        result
    }

    fn append_page(&mut self, value: Value) -> Result<Option<String>, AppError> {
        let page: Page = serde_json::from_value(value).map_err(|_| invalid())?;
        self.pages += 1;
        if self.pages > MAX_PAGES || self.models.len() + page.data.len() > MAX_MODELS {
            return Err(invalid());
        }
        for model in page.data {
            validate_model(&model)?;
            if self
                .models
                .iter()
                .any(|m| m.id == model.id || m.model == model.model)
            {
                return Err(invalid());
            }
            self.models.push(model);
        }
        if let Some(cursor) = &page.next_cursor {
            if cursor.is_empty()
                || cursor.len() > MAX_CURSOR_BYTES
                || !self.cursors.insert(cursor.clone())
            {
                return Err(invalid());
            }
        } else {
            self.complete = true;
        }
        Ok(page.next_cursor)
    }

    pub fn visible(&self) -> Result<Vec<&Model>, AppError> {
        if !self.complete || self.failed {
            return Err(invalid());
        }
        Ok(self.models.iter().filter(|m| !m.hidden).collect())
    }

    pub fn default_model(&self) -> Result<ProviderModel, AppError> {
        let matches: Vec<_> = self
            .visible()?
            .into_iter()
            .filter(|model| model.is_default)
            .collect();
        let [model] = matches.as_slice() else {
            return Err(invalid());
        };
        Ok(ProviderModel::Codex {
            model: model.model.clone(),
            effort: model.default_reasoning_effort,
        })
    }

    pub fn validate_choice(&self, choice: &ProviderModel) -> Result<(), AppError> {
        let ProviderModel::Codex { model, effort } = choice else {
            return Err(invalid());
        };
        if self.visible()?.iter().any(|item| {
            item.model == *model
                && item
                    .supported_reasoning_efforts
                    .iter()
                    .any(|e| e.reasoning_effort == *effort)
        }) {
            Ok(())
        } else {
            Err(AppError::new(
                ErrorCode::CliUnsupported,
                "저장된 Codex 모델 또는 reasoning 설정을 사용할 수 없습니다. AI 연결 설정에서 모델 목록을 조회하고 사용 가능한 모델을 선택해 저장해 주세요.",
            ))
        }
    }
}

fn validate_model(model: &Model) -> Result<(), AppError> {
    validate_provider_id(&model.id).map_err(|_| invalid())?;
    validate_provider_id(&model.model).map_err(|_| invalid())?;
    if model.display_name.trim().is_empty()
        || model.display_name.len() > MAX_DISPLAY_BYTES
        || model.display_name.chars().any(char::is_control)
        || model.supported_reasoning_efforts.is_empty()
        || model.supported_reasoning_efforts.len() > 8
        || !model
            .supported_reasoning_efforts
            .iter()
            .any(|e| e.reasoning_effort == model.default_reasoning_effort)
    {
        return Err(invalid());
    }
    Ok(())
}

fn invalid() -> AppError {
    AppError::new(
        ErrorCode::OutputInvalid,
        "Codex 모델 목록을 확인할 수 없습니다. 목록을 다시 조회해 주세요.",
    )
}
