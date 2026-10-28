use super::coordinates::byte_to_utf16;
use crate::domain::editor::{Heading, SourceBlock};
use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use std::ops::Range;

pub struct Analysis {
    pub headings: Vec<Heading>,
    pub blocks: Vec<SourceBlock>,
}

struct Collector<'a> {
    text: &'a str,
    result: Analysis,
    depth: usize,
    block_start: usize,
    heading: Option<Heading>,
    path: Vec<Heading>,
    lines: Vec<usize>,
}

pub fn analyze(text: &str) -> Analysis {
    let bom = usize::from(text.starts_with('\u{feff}')) * '\u{feff}'.len_utf8();
    let mut collector = Collector {
        text,
        result: Analysis {
            headings: Vec::new(),
            blocks: Vec::new(),
        },
        depth: 0,
        block_start: 0,
        heading: None,
        path: Vec::new(),
        lines: line_starts(text),
    };
    let options = Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH;
    for (event, range) in Parser::new_ext(&text[bom..], options).into_offset_iter() {
        collector.event(event, range.start + bom..range.end + bom);
    }
    if text.is_empty() {
        collector.block(0, 0);
    }
    close_sections(&mut collector.result.headings);
    collector.result
}

impl Collector<'_> {
    fn event(&mut self, event: Event<'_>, range: Range<usize>) {
        match event {
            Event::Start(tag) => self.start(tag, range.start),
            Event::Text(value) | Event::Code(value) => {
                if let Some(heading) = &mut self.heading {
                    heading.title.push_str(&value);
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some(heading) = &mut self.heading {
                    heading.title.push(' ');
                }
            }
            Event::End(tag) => self.end(tag, range.end),
            Event::Rule => self.block(range.start, range.end),
            _ => {}
        }
    }

    fn start(&mut self, tag: Tag<'_>, from: usize) {
        if self.depth == 0 {
            self.block_start = from;
        }
        self.depth += 1;
        if let Tag::Heading { level, .. } = tag {
            self.heading = Some(Heading {
                title: String::new(),
                level: level as u8,
                from: from as u32,
                to: self.text.len() as u32,
                from_utf16: byte_to_utf16(self.text, from),
            });
        }
    }

    fn end(&mut self, tag: TagEnd, to: usize) {
        if matches!(tag, TagEnd::Heading(_))
            && let Some(heading) = self.heading.take()
        {
            while self
                .path
                .last()
                .is_some_and(|last| last.level >= heading.level)
            {
                self.path.pop();
            }
            self.path.push(heading.clone());
            self.result.headings.push(heading);
        }
        self.depth -= 1;
        if self.depth == 0 {
            self.block(self.block_start, to);
        }
    }

    fn block(&mut self, from: usize, to: usize) {
        let line = self.lines.partition_point(|start| *start <= from);
        self.result.blocks.push(SourceBlock {
            id: format!("b{line}"),
            from: from as u32,
            to: to as u32,
            heading_path: self
                .path
                .iter()
                .map(|heading| heading.title.clone())
                .collect(),
            text: self.text[from..to].to_owned(),
        });
    }
}

fn line_starts(text: &str) -> Vec<usize> {
    let mut starts = vec![0];
    let bytes = text.as_bytes();
    for (index, byte) in bytes.iter().enumerate() {
        if *byte == b'\n' || (*byte == b'\r' && bytes.get(index + 1) != Some(&b'\n')) {
            starts.push(index + 1);
        }
    }
    starts
}

fn close_sections(headings: &mut [Heading]) {
    let mut open: Vec<usize> = Vec::new();
    for index in 0..headings.len() {
        while let Some(&previous) = open.last() {
            if headings[previous].level < headings[index].level {
                break;
            }
            headings[previous].to = headings[index].from;
            open.pop();
        }
        open.push(index);
    }
}
