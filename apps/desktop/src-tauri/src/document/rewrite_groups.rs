use super::{
    parse::analyze,
    rewrite_blocks::heading_level,
    rewrite_plan::{Entry, PlannedUnit},
    rewrite_references,
};
use crate::domain::review::ByteRange;

pub(super) fn group(entries: Vec<Entry>, before: &str, after: &str) -> Vec<PlannedUnit> {
    let mut parents = (0..entries.len()).collect::<Vec<_>>();
    let mut reasons = Vec::new();
    connect_moves(&entries, before, after, &mut parents, &mut reasons);
    connect_references(&entries, [before, after], &mut parents, &mut reasons);
    connect_headings(&entries, before, after, &mut parents, &mut reasons);
    assemble(entries, &parents, &reasons)
}

fn root(parents: &[usize], mut i: usize) -> usize {
    while parents[i] != i {
        i = parents[i];
    }
    i
}

fn connect(parents: &mut [usize], pair: (usize, usize)) {
    let a = root(parents, pair.0);
    let b = root(parents, pair.1);
    parents[a.max(b)] = a.min(b);
}

fn connect_moves(
    entries: &[Entry],
    before: &str,
    after: &str,
    parents: &mut [usize],
    reasons: &mut Vec<(usize, &'static str)>,
) {
    for (i, left) in entries
        .iter()
        .enumerate()
        .filter(|(_, e)| e.operation.after.is_empty())
    {
        for (j, right) in entries
            .iter()
            .enumerate()
            .filter(|(_, e)| e.operation.before.is_empty())
        {
            let moved = &left.operation.before;
            if !moved.is_empty()
                && moved == &right.operation.after
                && before.match_indices(moved.as_str()).count() == 1
                && after.match_indices(moved.as_str()).count() == 1
            {
                connect(parents, (i, j));
                reasons.push((i, "문단 이동 · 삭제와 추가를 함께 적용합니다."));
            }
        }
    }
}

fn connect_references(
    entries: &[Entry],
    documents: [&str; 2],
    parents: &mut [usize],
    reasons: &mut Vec<(usize, &'static str)>,
) {
    for (side, document) in documents.into_iter().enumerate() {
        let ranges = entries
            .iter()
            .map(|entry| {
                if side == 0 {
                    &entry.operation.range
                } else {
                    &entry.after_range
                }
            })
            .cloned()
            .collect::<Vec<_>>();
        for (definition, usage) in rewrite_references::dependencies(document, &ranges) {
            connect(parents, (definition, usage));
            reasons.push((definition, "참조 정의와 연결된 변경을 함께 적용합니다."));
        }
    }
}

fn intersects(left: &ByteRange, right: &ByteRange) -> bool {
    if left.from == left.to {
        left.from >= right.from && left.from < right.to
    } else {
        left.from < right.to && right.from < left.to
    }
}

fn connect_headings(
    entries: &[Entry],
    before: &str,
    after: &str,
    parents: &mut [usize],
    reasons: &mut Vec<(usize, &'static str)>,
) {
    let old = analyze(before).headings;
    let new = analyze(after).headings;
    for (i, entry) in entries.iter().enumerate() {
        if heading_level(&entry.operation.before) == heading_level(&entry.operation.after) {
            continue;
        }
        for (headings, candidate) in [(&old, false), (&new, true)] {
            let range = if candidate {
                &entry.after_range
            } else {
                &entry.operation.range
            };
            for heading in headings
                .iter()
                .filter(|h| h.from >= range.from && h.from < range.to)
            {
                let section = ByteRange {
                    from: heading.from,
                    to: heading.to,
                };
                for (j, other) in entries.iter().enumerate() {
                    let target = if candidate {
                        &other.after_range
                    } else {
                        &other.operation.range
                    };
                    if intersects(target, &section) {
                        connect(parents, (i, j));
                    }
                }
                reasons.push((i, "제목 구조와 관련 본문을 함께 적용합니다."));
            }
        }
    }
}

fn assemble(entries: Vec<Entry>, parents: &[usize], reasons: &[(usize, &str)]) -> Vec<PlannedUnit> {
    let mut units: Vec<(usize, PlannedUnit)> = Vec::new();
    for (i, entry) in entries.into_iter().enumerate() {
        let key = root(parents, i);
        if !units.iter().any(|(k, _)| *k == key) {
            let reason = reasons
                .iter()
                .find(|(j, _)| root(parents, *j) == key)
                .map_or("전체 재작성 후보의 변경입니다.", |(_, s)| *s);
            units.push((
                key,
                PlannedUnit {
                    title: entry.title,
                    kind: if reason.starts_with("문단 이동") {
                        "move".into()
                    } else {
                        entry.kind
                    },
                    reason: reason.into(),
                    operations: Vec::new(),
                },
            ));
        }
        if let Some((_, unit)) = units.iter_mut().find(|(k, _)| *k == key) {
            unit.operations.push(entry.operation);
        }
    }
    units.into_iter().map(|(_, unit)| unit).collect()
}
