import type { ReviewSide } from "../generated/ReviewSide";
import { displayLine, type ReviewRow } from "./rows";

export type LogicalSelection = { side: ReviewSide; from: number; to: number };
export type PaneSide = ReviewSide | "inline";
export type DisplayRow = { row: ReviewRow | null; from: number; text: string };
export function displayRows(rows: (ReviewRow | null)[]): DisplayRow[] {
  let from = 0;
  return rows.map((row) => {
    const text = row?.folded
      ? `⋯ 변경 없는 ${row.folded}개 행 — 펼치기`
      : displayLine(row?.raw ?? "");
    const result = { row, from, text };
    from += text.length + 1;
    return result;
  });
}
function sourceFrom(row: ReviewRow, side: ReviewSide): number | null {
  return side === "before" ? row.beforeFrom : row.afterFrom;
}
export function logicalSelection(
  rows: DisplayRow[],
  selection: { from: number; to: number },
  pane: PaneSide,
): LogicalSelection | null {
  const selected = rows.filter(
    (r) => r.from <= selection.to && r.from + r.text.length >= selection.from,
  );
  const first = selected[0];
  const last = selected.at(-1);
  if (!first?.row || !last?.row) return null;
  const side =
    pane === "inline"
      ? first.row.kind === "delete"
        ? "before"
        : "after"
      : pane;
  if (
    selected.some(
      (r) => !r.row || sourceFrom(r.row, side) === null || r.row.folded,
    )
  )
    return null;
  const start = sourceFrom(first.row, side);
  const end = sourceFrom(last.row, side);
  if (start === null || end === null) return null;
  return {
    side,
    from: start + selection.from - first.from,
    to: end + selection.to - last.from,
  };
}
export function displaySelection(
  rows: DisplayRow[],
  selection: LogicalSelection,
) {
  const locate = (offset: number) => {
    for (const display of rows) {
      if (!display.row || display.row.folded) continue;
      const start = sourceFrom(display.row, selection.side);
      if (
        start !== null &&
        offset >= start &&
        offset <= start + display.text.length
      )
        return display.from + offset - start;
    }
    return null;
  };
  const anchor = locate(selection.from);
  const head = locate(selection.to);
  return anchor === null || head === null ? null : { anchor, head };
}
