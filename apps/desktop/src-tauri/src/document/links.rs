use crate::domain::error::AppError;

pub fn external_url(href: &str) -> Result<String, AppError> {
    const MAX_URL_BYTES: usize = 8192;
    if href.len() > MAX_URL_BYTES || href.chars().any(char::is_control) {
        return Err(AppError::invalid("지원하지 않는 링크입니다."));
    }
    let url = url::Url::parse(href).map_err(|_| AppError::invalid("올바르지 않은 링크입니다."))?;
    if !matches!(url.scheme(), "http" | "https" | "mailto")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(AppError::invalid(
            "http, https, mailto 링크만 열 수 있습니다.",
        ));
    }
    Ok(url.into())
}
