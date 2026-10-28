use super::{
    coordinates::{grapheme_boundary, utf16_to_byte},
    parse::{Analysis, analyze},
};
use crate::domain::{
    document::DocumentSnapshot,
    editor::{ScopeSelection, ScopeSnapshot, SourceBlock},
    error::AppError,
};

pub fn select(
    document: &DocumentSnapshot,
    selection: ScopeSelection,
) -> Result<ScopeSnapshot, AppError> {
    let analysis = analyze(&document.content);
    let (from, to) = selected_range(&document.content, &analysis, selection)?;
    if from > to || (from == to && !document.content.is_empty()) {
        return Err(AppError::invalid("내용이 있는 범위를 선택해 주세요."));
    }
    grapheme_boundary(&document.content, from)?;
    grapheme_boundary(&document.content, to)?;
    let blocks = analysis
        .blocks
        .into_iter()
        .filter_map(|block| clip_block(block, &document.content, from, to))
        .collect();
    Ok(ScopeSnapshot {
        document_id: document.id.clone(),
        version_id: document.version_id.clone(),
        version: document.version,
        content_hash: document.content_hash.clone(),
        from: from as u32,
        to: to as u32,
        text: document.content[from..to].to_owned(),
        blocks,
    })
}

fn selected_range(
    text: &str,
    analysis: &Analysis,
    selection: ScopeSelection,
) -> Result<(usize, usize), AppError> {
    match selection {
        ScopeSelection::Whole => Ok((0, text.len())),
        ScopeSelection::Selection { from, to } => {
            Ok((utf16_to_byte(text, from)?, utf16_to_byte(text, to)?))
        }
        ScopeSelection::Section { cursor } => {
            let byte = utf16_to_byte(text, cursor)?;
            let heading = analysis
                .headings
                .iter()
                .rev()
                .find(|heading| heading.from as usize <= byte)
                .ok_or_else(|| {
                    AppError::invalid(
                        "현재 위치에 제목이 없습니다. 전체 문서나 선택 영역을 사용해 주세요.",
                    )
                })?;
            Ok((heading.from as usize, heading.to as usize))
        }
    }
}

fn clip_block(mut block: SourceBlock, text: &str, from: usize, to: usize) -> Option<SourceBlock> {
    let start = (block.from as usize).max(from);
    let end = (block.to as usize).min(to);
    if start >= end && !text.is_empty() {
        return None;
    }
    block.from = start as u32;
    block.to = end as u32;
    block.text = text[start..end].to_owned();
    Some(block)
}
