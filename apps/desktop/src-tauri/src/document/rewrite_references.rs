use crate::domain::review::ByteRange;
use pulldown_cmark::{CowStr, Event, LinkType, Options, Parser, Tag};
use std::{collections::BTreeSet, ops::Range};

pub(crate) fn dependencies(text: &str, ranges: &[ByteRange]) -> Vec<(usize, usize)> {
    let source = text.trim_start_matches('\u{feff}');
    let prefix = text.len() - source.len();
    let options = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH;
    let mut parser = Parser::new_ext(source, options).into_offset_iter();
    let mut edges = BTreeSet::new();
    while let Some((event, usage)) = parser.next() {
        let Some(id) = reference_id(event) else {
            continue;
        };
        let Some(definition) = parser.reference_definitions().get(&id) else {
            continue;
        };
        let definition = definition.span.start + prefix..definition.span.end + prefix;
        let usage = usage.start + prefix..usage.end + prefix;
        let definitions = owners(ranges, definition);
        let usages = owners(ranges, usage);
        connect_owners(&definitions, &usages, &mut edges);
    }
    edges.into_iter().collect()
}

fn reference_id(event: Event<'_>) -> Option<CowStr<'_>> {
    let (link_type, id) = match event {
        Event::Start(Tag::Link { link_type, id, .. } | Tag::Image { link_type, id, .. }) => {
            (link_type, id)
        }
        _ => return None,
    };
    matches!(
        link_type,
        LinkType::Reference | LinkType::Collapsed | LinkType::Shortcut
    )
    .then_some(id)
}

fn owners(ranges: &[ByteRange], span: Range<usize>) -> Vec<usize> {
    ranges
        .iter()
        .enumerate()
        .filter_map(|(index, range)| {
            (range.from < range.to
                && (range.from as usize) < span.end
                && span.start < range.to as usize)
                .then_some(index)
        })
        .collect()
}

fn connect_owners(definitions: &[usize], usages: &[usize], edges: &mut BTreeSet<(usize, usize)>) {
    for &definition in definitions {
        for &usage in usages {
            if definition != usage {
                edges.insert((definition.min(usage), definition.max(usage)));
            }
        }
    }
}
