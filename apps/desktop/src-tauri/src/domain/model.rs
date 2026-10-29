use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum ModelSelection {
    #[default]
    CliDefault,
    Sonnet,
    Opus,
    Haiku,
}

impl ModelSelection {
    pub fn alias(self) -> Option<&'static str> {
        match self {
            Self::CliDefault => None,
            Self::Sonnet => Some("sonnet"),
            Self::Opus => Some("opus"),
            Self::Haiku => Some("haiku"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ModelSettingsAction {
    Read,
    Save { model: ModelSelection },
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelSettingsRequest {
    pub schema_version: u32,
    pub action: ModelSettingsAction,
}
