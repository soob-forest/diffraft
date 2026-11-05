import type { DiffHunk } from "../generated/DiffHunk";
import type { DiffLine } from "../generated/DiffLine";
import type { GroupMark } from "./group-selection";
import { displayLine } from "./rows";

export const TEXT_DIFF_PAGE_SIZE = 50;
export function changedTextLines(hunks: DiffHunk[]) {
  return hunks.flatMap((hunk) =>
    hunk.lines.filter(
      (line) => line.kind === "delete" || line.kind === "insert",
    ),
  );
}
export function textDiffLine(line: DiffLine, markers?: Map<string, GroupMark>) {
  const key = textDiffLineKey(line);
  const marker = markers?.get(key);
  const identity = marker
    ? `${marker.title}${marker.selected ? " · 선택됨" : ""} · `
    : markers
      ? "변경 단위 확인 필요 · "
      : "";
  const number = line.kind === "delete" ? line.oldLine : line.newLine;
  const location = number === null ? "행 번호 확인 필요" : `${number}행`;
  const change = line.kind === "delete" ? "삭제 · 변경 전" : "추가 · 변경 후";
  const text = displayLine(
    line.segments.map((segment) => segment.text).join(""),
  );
  return {
    key,
    label: `${identity}${change} ${location}`,
    text: text || "(빈 행)",
  };
}
export function textDiffLineKey(line: DiffLine) {
  return `${line.kind}:${line.oldLine}:${line.newLine}`;
}
export function textDiffPage(lines: DiffLine[], requestedPage: number) {
  const lastPage = Math.max(
    0,
    Math.ceil(lines.length / TEXT_DIFF_PAGE_SIZE) - 1,
  );
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(0, Math.min(requestedPage, lastPage))
    : 0;
  const start = page * TEXT_DIFF_PAGE_SIZE;
  const end = Math.min(start + TEXT_DIFF_PAGE_SIZE, lines.length);
  return {
    page,
    lastPage,
    start,
    end,
    lines: lines.slice(start, end),
    total: lines.length,
  };
}
