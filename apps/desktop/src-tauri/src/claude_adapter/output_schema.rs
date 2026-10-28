use crate::domain::{
    ai::{AiResponse, ResponseMode},
    error::AppError,
};

pub(super) fn for_mode(mode: ResponseMode) -> Result<String, AppError> {
    let schema = schemars::generate::SchemaSettings::draft07()
        .into_generator()
        .into_root_schema_for::<AiResponse>();
    let value = serde_json::to_value(schema).map_err(|_| invalid())?;
    let mode = serde_json::to_value(mode).map_err(|_| invalid())?;
    let mut selected = value["oneOf"]
        .as_array()
        .ok_or_else(invalid)?
        .iter()
        .find(|branch| branch["properties"]["mode"]["const"] == mode)
        .and_then(|branch| branch.as_object())
        .cloned()
        .ok_or_else(invalid)?;
    for key in ["$schema", "definitions"] {
        if let Some(metadata) = value.get(key) {
            selected.insert(key.into(), metadata.clone());
        }
    }
    serde_json::to_string(&selected).map_err(|_| invalid())
}
fn invalid() -> AppError {
    AppError::invalid("CLI 응답 계약을 만들 수 없습니다.")
}
