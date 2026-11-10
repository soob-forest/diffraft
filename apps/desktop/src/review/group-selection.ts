import type { ReviewProjection } from "../generated/ReviewProjection";
import type { LogicalSelection } from "./coordinates";
import { type ReviewRow, utf16AtByte } from "./rows";

export function groupAtSelection(
  projection: ReviewProjection,
  selection: LogicalSelection,
) {
  const text =
    selection.side === "before" ? projection.before : projection.after;
  return projection.groups.find((group) => {
    const ranges =
      selection.side === "before" ? group.beforeRanges : group.afterRanges;
    return ranges.some((range) => {
      const from = utf16AtByte(text, range.from),
        to = utf16AtByte(text, range.to);
      return (
        selection.from >= from &&
        selection.to <= to &&
        (selection.from < to || from === to)
      );
    });
  });
}

export type GroupMark = { id: string; title: string; selected: boolean };
export function groupJumpSelection(
  projection: ReviewProjection,
  rows: ReviewRow[],
  groupId: string,
): LogicalSelection | null {
  for (const row of rows) {
    const match = groupInRow(projection, row, groupId);
    if (match?.group.id === groupId) return match.selection;
  }
  return null;
}

export function groupRowMarks(
  projection: ReviewProjection,
  rows: ReviewRow[],
  selectedId: string,
) {
  const marks = new Map<string, GroupMark>();
  for (const row of rows) {
    const group = groupInRow(projection, row, selectedId)?.group;
    if (!group) continue;
    const proposal = projection.batch.proposals.find(
      (p) => p.id === group.proposals[0]?.id,
    );
    const unit = projection.batch.reviewUnits?.find(
      (unit) => unit.id === group.id,
    );
    marks.set(row.key, {
      id: group.id,
      title: unit
        ? `변경 ${unit.number} · ${unit.title}`
        : proposal?.operation.headingPath.at(-1) || "문서",
      selected: group.id === selectedId,
    });
  }
  return marks;
}

function groupInRow(
  projection: ReviewProjection,
  row: ReviewRow,
  preferred: string,
) {
  if (row.kind !== "insert" && row.kind !== "delete") return null;
  const side = row.kind === "delete" ? "before" : "after";
  const offset = side === "before" ? row.beforeFrom : row.afterFrom;
  if (offset === null) return null;
  const text = side === "before" ? projection.before : projection.after;
  const matches = projection.groups.flatMap((group) => {
    const ranges = side === "before" ? group.beforeRanges : group.afterRanges;
    return ranges.flatMap((range) => {
      const from = utf16AtByte(text, range.from),
        to = utf16AtByte(text, range.to);
      const position = Math.max(offset, from);
      if (from === to && from < offset) return [];
      const end = offset + row.raw.length;
      if (position >= end && position !== offset) return [];
      if (position >= to && from !== to) return [];
      return [
        {
          group,
          selection: { side, from: position, to: position } as LogicalSelection,
        },
      ];
    });
  });
  return (
    matches.find((match) => match.group.id === preferred) ?? matches[0] ?? null
  );
}

export function restoreGroupSelection(
  projection: ReviewProjection | null,
  groupId: string,
  proposalId: string,
) {
  const groups = projection?.groups ?? [];
  return (
    groups.find((g) => g.id === groupId) ??
    groups.find((g) => g.proposals.some((p) => p.id === proposalId)) ??
    groups[0]
  );
}
