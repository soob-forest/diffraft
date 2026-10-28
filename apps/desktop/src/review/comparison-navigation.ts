import type { LogicalSelection } from "./coordinates";
import { type DiffComparison, sourceLines } from "./rows";

export function comparisonJump(
  comparison: DiffComparison,
  position: number,
  direction: number,
): { position: number; selection: LogicalSelection } | null {
  const count = comparison.hunks.length;
  if (!count) return null;
  const next =
    position < 0
      ? direction < 0
        ? count - 1
        : 0
      : (position + direction + count) % count;
  const changed = comparison.hunks[next].lines.find(
    (line) => line.kind === "delete" || line.kind === "insert",
  );
  if (!changed) return null;
  const side = changed.kind === "delete" ? "before" : "after";
  const number = side === "before" ? changed.oldLine : changed.newLine;
  const line =
    number === null ? null : sourceLines(comparison[side])[number - 1];
  if (!line) throw new Error("변경 이동 범위를 찾을 수 없습니다.");
  return {
    position: next,
    selection: { side, from: line.from, to: line.from },
  };
}
