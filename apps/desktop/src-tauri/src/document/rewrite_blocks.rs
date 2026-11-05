use super::parse::analyze;
use crate::domain::review::ByteRange;
use pulldown_cmark::{Event, Options, Parser, Tag};
use std::ops::Range;
use unicode_segmentation::UnicodeSegmentation;

pub(super) struct Block {
    pub from: usize,
    pub text: String,
    pub id: String,
    pub title: String,
    pub path: Vec<String>,
    pub shape: String,
}

pub(super) fn blocks(text: &str) -> Vec<Block> {
    if text.is_empty() {
        return Vec::new();
    }
    let analysis = analyze(text);
    if analysis.blocks.is_empty() {
        return vec![Block {
            from: 0,
            text: text.into(),
            id: "rewrite".into(),
            title: "문서 공백 변경".into(),
            path: Vec::new(),
            shape: "space".into(),
        }];
    }
    analysis
        .blocks
        .iter()
        .enumerate()
        .map(|(i, block)| {
            let from = if i == 0 { 0 } else { block.from as usize };
            let to = analysis
                .blocks
                .get(i + 1)
                .map_or(text.len(), |b| b.from as usize);
            let raw = &text[from..to];
            Block {
                from,
                text: raw.into(),
                id: block.id.clone(),
                path: block.heading_path.clone(),
                title: title(raw, &block.heading_path),
                shape: shape(raw),
            }
        })
        .collect()
}

pub(super) fn range(blocks: &[Block], len: usize, span: &Range<usize>) -> ByteRange {
    ByteRange {
        from: blocks.get(span.start).map_or(len, |b| b.from) as u32,
        to: blocks.get(span.end).map_or(len, |b| b.from) as u32,
    }
}

pub(super) fn heading_level(text: &str) -> Option<u8> {
    match Parser::new_ext(text.trim_start_matches('\u{feff}'), Options::ENABLE_TABLES).next() {
        Some(Event::Start(Tag::Heading { level, .. })) => Some(level as u8),
        _ => None,
    }
}

fn shape(text: &str) -> String {
    match Parser::new_ext(text.trim_start_matches('\u{feff}'), Options::ENABLE_TABLES).next() {
        Some(Event::Start(Tag::Paragraph)) => "paragraph".into(),
        Some(Event::Start(Tag::Heading { level, .. })) => format!("heading-{}", level as u8),
        Some(Event::Start(Tag::Table(_))) => "table".into(),
        Some(Event::Start(Tag::List(_))) => "list".into(),
        Some(Event::Start(Tag::CodeBlock(_))) => "code".into(),
        Some(Event::Start(Tag::BlockQuote(_))) => "quote".into(),
        _ => "structure".into(),
    }
}

fn title(text: &str, path: &[String]) -> String {
    let first = text
        .trim_start_matches('\u{feff}')
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("문서 변경");
    let label = path.last().map_or(first, String::as_str);
    label.graphemes(true).take(80).collect()
}
