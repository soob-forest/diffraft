use crate::domain::{
    ai::AiResponse,
    document::validate_content,
    editor::{ScopeSnapshot, SourceBlock},
    error::{AppError, ErrorCode},
    review::{ByteRange, EditOperation},
};
use pulldown_cmark::{Event, Options, Parser, Tag};
use unicode_segmentation::UnicodeSegmentation;

pub fn invalid_patch() -> AppError {
    AppError::new(
        ErrorCode::OutputInvalid,
        "제안의 원문·범위가 맞지 않거나 변경 위치가 모호합니다. 문맥을 포함해 다시 요청해 주세요.",
    )
}

pub fn validate_patch(
    base: &str,
    scope: &ScopeSnapshot,
    response: &AiResponse,
) -> Result<Vec<EditOperation>, AppError> {
    response.validate()?;
    let AiResponse::Patch { changes, .. } = response else {
        return Err(invalid_patch());
    };
    if base.get(scope.from as usize..scope.to as usize) != Some(scope.text.as_str()) {
        return Err(invalid_patch());
    }
    let mut operations = Vec::new();
    let source_blocks = super::parse::analyze(base).blocks;
    for change in changes {
        let block = scope
            .blocks
            .iter()
            .find(|b| b.id == change.block_id)
            .ok_or_else(invalid_patch)?;
        validate_block(base, scope, block)?;
        let original = source_blocks
            .iter()
            .find(|b| b.id == block.id)
            .ok_or_else(invalid_patch)?;
        if block.from < original.from || block.to > original.to {
            return Err(invalid_patch());
        }
        let range = locate(block, &change.before)?;
        validate_content(&change.after).map_err(|_| invalid_patch())?;
        if change.before != change.after {
            operations.push(EditOperation {
                range,
                block_id: block.id.clone(),
                heading_path: block.heading_path.clone(),
                before: change.before.clone(),
                after: change.after.clone(),
                reason: change.reason.clone(),
                requires_group: structural_block(&original.text) || structural_block(&change.after),
            });
        }
    }
    operations.sort_by_key(|operation| operation.range.from);
    apply(base, &operations)?;
    Ok(operations)
}

fn validate_block(base: &str, scope: &ScopeSnapshot, block: &SourceBlock) -> Result<(), AppError> {
    if block.from < scope.from
        || block.to > scope.to
        || base.get(block.from as usize..block.to as usize) != Some(block.text.as_str())
    {
        return Err(invalid_patch());
    }
    Ok(())
}

fn locate(block: &SourceBlock, before: &str) -> Result<ByteRange, AppError> {
    if before.is_empty() {
        return if block.text.is_empty() {
            Ok(ByteRange {
                from: block.from,
                to: block.from,
            })
        } else {
            Err(invalid_patch())
        };
    }
    let offset = block.text.find(before).ok_or_else(invalid_patch)?;
    let first_width = before.chars().next().ok_or_else(invalid_patch)?.len_utf8();
    if block.text[offset + first_width..].contains(before) {
        return Err(invalid_patch());
    }
    Ok(ByteRange {
        from: block.from + offset as u32,
        to: block.from + (offset + before.len()) as u32,
    })
}

pub fn apply(base: &str, operations: &[EditOperation]) -> Result<String, AppError> {
    let mut ordered: Vec<_> = operations.iter().collect();
    ordered.sort_by_key(|operation| operation.range.from);
    let mut result = String::new();
    let mut cursor = 0;
    let mut previous_start = None;
    verify_boundaries(
        base,
        ordered
            .iter()
            .flat_map(|op| [op.range.from as usize, op.range.to as usize])
            .collect(),
    )?;
    let mut result_boundaries = Vec::new();
    for operation in ordered {
        let from = operation.range.from as usize;
        let to = operation.range.to as usize;
        if from < cursor
            || previous_start == Some(from)
            || base.get(from..to) != Some(operation.before.as_str())
        {
            return Err(invalid_patch());
        }
        result.push_str(base.get(cursor..from).ok_or_else(invalid_patch)?);
        result_boundaries.push(result.len());
        result.push_str(&operation.after);
        result_boundaries.push(result.len());
        if result.len() > crate::domain::MAX_DOCUMENT_BYTES {
            return Err(invalid_patch());
        }
        cursor = to;
        previous_start = Some(from);
    }
    result.push_str(base.get(cursor..).ok_or_else(invalid_patch)?);
    validate_content(&result).map_err(|_| invalid_patch())?;
    verify_boundaries(&result, result_boundaries)?;
    Ok(result)
}

pub fn requires_dependency_group(operations: &[EditOperation]) -> bool {
    operations.iter().any(|operation| {
        operation.requires_group
            || [&operation.before, &operation.after].iter().any(|text| {
                text.contains(['\n', '\r', '[', ']', '|', '`'])
                    || text.trim_start().starts_with(['#', '-', '*', '>', '+'])
            })
    })
}

fn structural_block(text: &str) -> bool {
    matches!(Parser::new_ext(text.trim_start_matches('\u{feff}'), Options::ENABLE_TABLES).next(), Some(Event::Start(tag)) if !matches!(tag, Tag::Paragraph))
}

fn verify_boundaries(text: &str, mut positions: Vec<usize>) -> Result<(), AppError> {
    positions.sort_unstable();
    positions.dedup();
    let mut expected = positions.into_iter().peekable();
    for boundary in text
        .grapheme_indices(true)
        .map(|(byte, _)| byte)
        .chain(std::iter::once(text.len()))
    {
        let Some(&next) = expected.peek() else {
            return Ok(());
        };
        if next < boundary {
            return Err(invalid_patch());
        }
        if next == boundary {
            expected.next();
        }
    }
    if expected.next().is_some() {
        return Err(invalid_patch());
    }
    Ok(())
}
