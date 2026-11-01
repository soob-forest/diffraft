use super::{Store, errors::database_error};
use crate::domain::{
    ai_settings::{AiPreferences, AiSettingsAction, validate_path},
    error::AppError,
    provider::ProviderModel,
};
use rusqlite::params;

type PreferencesRow = (String, Option<String>, Option<String>);

impl Store {
    pub fn ai_preferences(&self) -> Result<AiPreferences, AppError> {
        let (provider, codex, codex_path): PreferencesRow = self
            .connection()?
            .query_row(
                "SELECT provider,codex_model,codex_path FROM ai_preferences WHERE id=1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(database_error)?;
        let provider = serde_json::from_value(provider.into()).map_err(|_| invalid())?;
        let codex_model: Option<ProviderModel> = codex
            .map(|value| serde_json::from_str(&value).map_err(|_| invalid()))
            .transpose()?;
        if let Some(model) = &codex_model {
            model.validate()?;
            if !matches!(model, ProviderModel::Codex { .. }) {
                return Err(invalid());
            }
        }
        if let Some(path) = &codex_path {
            validate_path(path)?;
        }
        Ok(AiPreferences {
            provider,
            codex_model,
            codex_path,
        })
    }

    pub fn update_ai_preferences(
        &self,
        action: AiSettingsAction,
    ) -> Result<AiPreferences, AppError> {
        self.ai_preferences()?;
        match action {
            AiSettingsAction::Read => {}
            AiSettingsAction::Provider { provider } => {
                let value = serde_json::to_value(provider).map_err(|_| invalid())?;
                self.connection()?
                    .execute(
                        "UPDATE ai_preferences SET provider=?1 WHERE id=1",
                        [value.as_str()],
                    )
                    .map_err(database_error)?;
            }
            AiSettingsAction::Model { model } => self.save_provider_model(model.as_ref())?,
            AiSettingsAction::CodexPath { path } => {
                validate_path(&path)?;
                self.connection()?
                    .execute("UPDATE ai_preferences SET codex_path=?1 WHERE id=1", [path])
                    .map_err(database_error)?;
            }
        }
        self.ai_preferences()
    }

    fn save_provider_model(&self, model: Option<&ProviderModel>) -> Result<(), AppError> {
        if let Some(model) = model {
            model.validate()?;
        }
        if let Some(ProviderModel::Claude { model }) = model {
            crate::claude_adapter::model_settings::save(self.directory(), *model)?;
            return Ok(());
        }
        let value = model
            .map(serde_json::to_string)
            .transpose()
            .map_err(|_| invalid())?;
        self.connection()?
            .execute(
                "UPDATE ai_preferences SET codex_model=?1 WHERE id=1",
                params![value],
            )
            .map_err(database_error)?;
        Ok(())
    }
}

fn invalid() -> AppError {
    AppError::invalid("AI 연결 설정 기록이 올바르지 않습니다.")
}
