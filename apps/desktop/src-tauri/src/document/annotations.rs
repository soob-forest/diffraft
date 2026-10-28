use super::coordinates::{grapheme_boundary, utf16_to_byte};
use crate::domain::{
    annotations::{AddComment, CommentAnchor, ReviewSide},
    error::AppError,
    review::{ByteRange, Proposal, ReviewBatch},
};
use unicode_segmentation::UnicodeSegmentation;

const CONTEXT_GRAPHEMES: usize = 32;

pub fn anchor(
    batch: &ReviewBatch,
    proposal: &Proposal,
    request: &AddComment,
) -> Result<CommentAnchor, AppError> {
    let text = match request.side {
        ReviewSide::Before => &proposal.operation.before,
        ReviewSide::After => &proposal.operation.after,
    };
    let from = utf16_to_byte(text, request.from_utf16)?;
    let to = utf16_to_byte(text, request.to_utf16)?;
    if from >= to {
        return Err(AppError::invalid(
            "코멘트를 남길 텍스트 범위를 선택해 주세요.",
        ));
    }
    grapheme_boundary(text, from)?;
    grapheme_boundary(text, to)?;
    let offset = if request.side == ReviewSide::Before {
        proposal.operation.range.from
    } else {
        0
    };
    let range = ByteRange {
        from: offset + from as u32,
        to: offset + to as u32,
    };
    Ok(CommentAnchor {
        side: request.side,
        version_id: batch.base_version_id.clone(),
        proposal_revision: proposal.revision,
        block_id: proposal.operation.block_id.clone(),
        range: range.clone(),
        quote: text[from..to].into(),
        prefix: preceding_context(&text[..from]),
        suffix: text[to..].graphemes(true).take(CONTEXT_GRAPHEMES).collect(),
        display_revision: proposal.revision,
        display_range: Some(range),
    })
}

fn preceding_context(text: &str) -> String {
    let mut graphemes: Vec<_> = text.graphemes(true).rev().take(CONTEXT_GRAPHEMES).collect();
    graphemes.reverse();
    graphemes.concat()
}

pub fn reanchor(original: &CommentAnchor, after: &str, revision: u32) -> CommentAnchor {
    let mut anchor = original.clone();
    anchor.display_revision = revision;
    anchor.display_range = match anchor.side {
        ReviewSide::Before => Some(anchor.range.clone()),
        ReviewSide::After => unique_quote(after, &anchor.quote),
    };
    anchor
}

fn unique_quote(text: &str, quote: &str) -> Option<ByteRange> {
    let from = text.find(quote)?;
    let first = quote.chars().next()?.len_utf8();
    if text[from + first..].contains(quote) {
        return None;
    }
    let to = from + quote.len();
    grapheme_boundary(text, from).ok()?;
    grapheme_boundary(text, to).ok()?;
    Some(ByteRange {
        from: from as u32,
        to: to as u32,
    })
}
