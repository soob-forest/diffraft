import type { DiffLine } from "../generated/DiffLine";
import type { ReviewProjection } from "../generated/ReviewProjection";

export type SourceLine = { text: string; from: number; byteFrom: number };
export type ReviewRow = DiffLine & {
  key: string;
  raw: string;
  beforeFrom: number | null;
  afterFrom: number | null;
  folded: number;
};
const encoder = new TextEncoder();
export type DiffComparison = Pick<
  ReviewProjection,
  "before" | "after" | "hunks"
>;

export function sourceLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  const pattern = /[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g;
  let byteFrom = 0;
  for (const match of text.matchAll(pattern)) {
    lines.push({ text: match[0], from: match.index, byteFrom });
    byteFrom += encoder.encode(match[0]).length;
  }
  return lines;
}

export function reviewRows(
  projection: DiffComparison,
  expanded: ReadonlySet<string>,
  full: boolean,
): ReviewRow[] {
  const before = sourceLines(projection.before);
  const after = sourceLines(projection.after);
  const oldIndex = boundaryIndex(before, projection.before);
  const newIndex = boundaryIndex(after, projection.after);
  const result: ReviewRow[] = [];
  let oldCursor = 0;
  let newCursor = 0;
  for (const hunk of projection.hunks) {
    const oldStart = oldIndex.get(hunk.oldRange.from);
    const newStart = newIndex.get(hunk.newRange.from);
    if (oldStart === undefined || newStart === undefined)
      throw new Error("비교 문맥 범위가 올바르지 않습니다.");
    appendGap(
      result,
      {
        before,
        after,
        oldCursor,
        newCursor,
        oldEnd: oldStart,
        newEnd: newStart,
      },
      expanded,
      full,
    );
    for (const line of hunk.lines) result.push(row(line, before, after));
    oldCursor = oldIndex.get(hunk.oldRange.to) ?? before.length;
    newCursor = newIndex.get(hunk.newRange.to) ?? after.length;
  }
  appendGap(
    result,
    {
      before,
      after,
      oldCursor,
      newCursor,
      oldEnd: before.length,
      newEnd: after.length,
    },
    expanded,
    full,
  );
  return result;
}

type Gap = {
  before: SourceLine[];
  after: SourceLine[];
  oldCursor: number;
  newCursor: number;
  oldEnd: number;
  newEnd: number;
};
function appendGap(
  result: ReviewRow[],
  gap: Gap,
  expanded: ReadonlySet<string>,
  full: boolean,
) {
  const count = gap.oldEnd - gap.oldCursor;
  if (count !== gap.newEnd - gap.newCursor)
    throw new Error("비교 문맥이 일치하지 않습니다.");
  if (!count) return;
  const key = `fold:${gap.oldCursor}:${gap.newCursor}`;
  if (!full && !expanded.has(key)) {
    result.push({
      key,
      kind: "fold",
      oldLine: null,
      newLine: null,
      segments: [],
      raw: "",
      beforeFrom: null,
      afterFrom: null,
      folded: count,
    });
    return;
  }
  for (let offset = 0; offset < count; offset++) {
    const oldLine = gap.oldCursor + offset + 1;
    const newLine = gap.newCursor + offset + 1;
    const text = gap.before[oldLine - 1].text;
    if (text !== gap.after[newLine - 1].text)
      throw new Error("비교 문맥이 일치하지 않습니다.");
    result.push(
      row(
        {
          kind: "equal",
          oldLine,
          newLine,
          segments: [{ text, changed: false }],
        },
        gap.before,
        gap.after,
      ),
    );
  }
}

function row(
  line: DiffLine,
  before: SourceLine[],
  after: SourceLine[],
): ReviewRow {
  return {
    ...line,
    key: `${line.kind}:${line.oldLine}:${line.newLine}`,
    raw: line.segments.map((s) => s.text).join(""),
    beforeFrom: line.oldLine === null ? null : before[line.oldLine - 1].from,
    afterFrom: line.newLine === null ? null : after[line.newLine - 1].from,
    folded: 0,
  };
}

function boundaryIndex(lines: SourceLine[], text: string): Map<number, number> {
  const index = new Map(
    lines.map((line, position) => [line.byteFrom, position]),
  );
  index.set(encoder.encode(text).length, lines.length);
  return index;
}

export type SplitRow = {
  before: ReviewRow | null;
  after: ReviewRow | null;
  key: string;
};
export function splitRows(rows: ReviewRow[]): SplitRow[] {
  const result: SplitRow[] = [];
  let cursor = 0;
  while (cursor < rows.length) {
    const current = rows[cursor];
    if (current.kind === "equal" || current.kind === "fold") {
      result.push({ before: current, after: current, key: current.key });
      cursor++;
      continue;
    }
    const deleted: ReviewRow[] = [];
    const inserted: ReviewRow[] = [];
    while (
      cursor < rows.length &&
      ["delete", "insert"].includes(rows[cursor].kind)
    ) {
      const next = rows[cursor++];
      (next.kind === "delete" ? deleted : inserted).push(next);
    }
    for (
      let index = 0;
      index < Math.max(deleted.length, inserted.length);
      index++
    ) {
      result.push({
        before: deleted[index] ?? null,
        after: inserted[index] ?? null,
        key: `${deleted[index]?.key}/${inserted[index]?.key}`,
      });
    }
  }
  return result;
}

export function displayLine(raw: string): string {
  return raw.replace(/(?:\r\n|\r|\n)$/, "");
}
export function utf16AtByte(text: string, byte: number): number {
  const bytes = encoder.encode(text);
  if (byte < 0 || byte > bytes.length)
    throw new Error("비교 범위가 문서를 벗어났습니다.");
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
    bytes.subarray(0, byte),
  ).length;
}
