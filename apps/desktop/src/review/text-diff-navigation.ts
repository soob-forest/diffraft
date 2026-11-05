import type { DiffLine } from "../generated/DiffLine";
import type { LogicalSelection } from "./coordinates";
import type { GroupMark } from "./group-selection";
import { displayLine, type ReviewRow } from "./rows";
import { TEXT_DIFF_PAGE_SIZE, textDiffLineKey } from "./text-diff-model";

export type TextDiffJump = { serial: number; rowKey: string };
export type TextRowReveal = { rowKey: string };
export type TextPageState = {
  page: number;
  selectedGroup?: string;
  jumpSerial?: number;
  reveal?: TextRowReveal | null;
};
type Target = {
  selectedGroup?: string;
  selectedPage: number | null;
  selectedRowKey?: string;
  jump?: TextDiffJump | null;
  jumpPage: number | null;
};

export function textDiffJump(
  rows: ReviewRow[],
  jump: { serial: number; selection: LogicalSelection } | null,
): TextDiffJump | null {
  if (!jump) return null;
  const { side, from } = jump.selection;
  const kind = side === "before" ? "delete" : "insert";
  const row = rows.find((row) => {
    if (row.kind !== kind) return false;
    const start = side === "before" ? row.beforeFrom : row.afterFrom;
    return (
      start !== null &&
      from >= start &&
      from <= start + displayLine(row.raw).length
    );
  });
  return row ? { serial: jump.serial, rowKey: row.key } : null;
}

export function selectedTextPages(
  lines: DiffLine[],
  markers: Map<string, GroupMark> | undefined,
  selectedGroup: string | undefined,
) {
  const pages = new Set<number>();
  let title = "";
  let firstKey: string | undefined;
  for (const [index, line] of lines.entries()) {
    const marker = markers?.get(textDiffLineKey(line));
    if (!selectedGroup || marker?.id !== selectedGroup) continue;
    pages.add(Math.floor(index / TEXT_DIFF_PAGE_SIZE));
    title = marker.title;
    firstKey ??= textDiffLineKey(line);
  }
  return { pages: [...pages], title, firstKey };
}

export function textJumpPage(
  lines: DiffLine[],
  markers: Map<string, GroupMark> | undefined,
  selectedGroup: string | undefined,
  jump: TextDiffJump | null | undefined,
) {
  if (!selectedGroup || !jump) return null;
  if (markers?.get(jump.rowKey)?.id !== selectedGroup) return null;
  const index = lines.findIndex(
    (line) => textDiffLineKey(line) === jump.rowKey,
  );
  return index < 0 ? null : Math.floor(index / TEXT_DIFF_PAGE_SIZE);
}

export function reconcileTextPage(
  state: TextPageState,
  target: Target,
): TextPageState {
  const selectionChanged = state.selectedGroup !== target.selectedGroup;
  const jumpSerial = target.jump?.serial ?? state.jumpSerial;
  const jumpChanged = state.jumpSerial !== jumpSerial;
  if (!selectionChanged && !jumpChanged) return state;
  const destination = jumpChanged ? target.jumpPage : null;
  const page =
    destination ?? (selectionChanged ? (target.selectedPage ?? 0) : state.page);
  return {
    page,
    selectedGroup: target.selectedGroup,
    jumpSerial,
    reveal: requestedTextRow(target, selectionChanged, destination),
  };
}

function requestedTextRow(
  target: Target,
  selectionChanged: boolean,
  destination: number | null,
) {
  if (destination !== null && target.jump)
    return { rowKey: target.jump.rowKey };
  if (selectionChanged && target.selectedRowKey)
    return { rowKey: target.selectedRowKey };
  return null;
}
