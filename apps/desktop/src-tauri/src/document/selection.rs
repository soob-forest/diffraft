use super::coordinates::{grapheme_boundary, utf16_to_byte};
use crate::domain::{
    document::validate_content, error::AppError, regeneration::CandidateSelection,
};

pub fn selection_range(
    candidate: &str,
    selection: &CandidateSelection,
) -> Result<std::ops::Range<usize>, AppError> {
    let from = utf16_to_byte(candidate, selection.from_utf16)?;
    let to = utf16_to_byte(candidate, selection.to_utf16)?;
    if from >= to || candidate.get(from..to) != Some(selection.quote.as_str()) {
        return Err(AppError::invalid(
            "후보와 선택한 인용이 일치하지 않습니다. 다시 선택해 주세요.",
        ));
    }
    grapheme_boundary(candidate, from)?;
    grapheme_boundary(candidate, to)?;
    Ok(from..to)
}
pub fn replace_selection(
    candidate: &str,
    selection: &CandidateSelection,
    replacement: &str,
) -> Result<String, AppError> {
    let range = selection_range(candidate, selection)?;
    validate_content(replacement)?;
    let result = format!(
        "{}{}{}",
        &candidate[..range.start],
        replacement,
        &candidate[range.end..]
    );
    validate_content(&result)?;
    grapheme_boundary(&result, range.start)?;
    grapheme_boundary(&result, range.start + replacement.len())?;
    Ok(result)
}
