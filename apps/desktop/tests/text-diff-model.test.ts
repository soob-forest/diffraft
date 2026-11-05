import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { DiffHunk } from "../src/generated/DiffHunk";
import type { DiffLine } from "../src/generated/DiffLine";
import type { GroupMark } from "../src/review/group-selection";
import { TextDiff, TextDiffPages } from "../src/review/TextDiff";
import {
  changedTextLines,
  textDiffLine,
  textDiffPage,
} from "../src/review/text-diff-model";

const line = (kind: string, number: number, text: string): DiffLine => ({
  kind,
  oldLine: kind === "delete" ? number : null,
  newLine: kind === "insert" ? number : null,
  segments: [{ text, changed: true }],
});
const hunk = (lines: DiffLine[]): DiffHunk => ({
  oldRange: { from: 0, to: 0 },
  newRange: { from: 0, to: 0 },
  groupIds: ["first", "second"],
  lines,
});

it("uses the exact row marker when several units share one hunk", () => {
  const hunks = [
    hunk([line("delete", 3, "before"), line("insert", 7, "after")]),
  ];
  const markers = new Map<string, GroupMark>([
    [
      "delete:3:null",
      { id: "first", title: "변경 4 · 첫 변경", selected: false },
    ],
    [
      "insert:null:7",
      { id: "second", title: "변경 9 · 둘 변경", selected: true },
    ],
  ]);
  const changes = changedTextLines(hunks).map((value) =>
    textDiffLine(value, markers),
  );
  expect(changes[0].label).toBe("변경 4 · 첫 변경 · 삭제 · 변경 전 3행");
  expect(changes[1].label).toBe(
    "변경 9 · 둘 변경 · 선택됨 · 추가 · 변경 후 7행",
  );
  expect(textDiffLine(line("insert", 8, "missing"), markers).label).toContain(
    "변경 단위 확인 필요",
  );
});

it("keeps current and original hunks separate after partial decisions", () => {
  const current = [hunk([line("insert", 1, "remaining")])];
  const original = [
    hunk([line("delete", 1, "old"), line("insert", 1, "rejected original")]),
  ];
  expect(
    changedTextLines(current).map((row) => textDiffLine(row).text),
  ).toEqual(["remaining"]);
  expect(
    changedTextLines(original).map((row) => textDiffLine(row).text),
  ).toEqual(["old", "rejected original"]);
});

it("clamps a stale page after rows shrink and preserves fifty-row defaults", () => {
  const lines = Array.from({ length: 60 }, (_, index) =>
    line("delete", index + 1, "text"),
  );
  expect(textDiffPage(lines, 0).lines).toHaveLength(50);
  expect(textDiffPage(lines, 1)).toMatchObject({
    page: 1,
    start: 50,
    end: 60,
    lastPage: 1,
  });
  expect(textDiffPage(lines.slice(0, 1), 1)).toMatchObject({
    page: 0,
    start: 0,
    end: 1,
  });
  expect(textDiffPage([], 4)).toMatchObject({ page: 0, start: 0, end: 0 });
  expect(textDiffPage(lines, -1).page).toBe(0);
});

it("renders HTML as text, represents blank rows, and preserves default history labels", () => {
  const hunks = [
    hunk([line("delete", 1, "<img src=x>\r\n"), line("insert", 2, "\r\n")]),
  ];
  const markup = renderToStaticMarkup(createElement(TextDiffPages, { hunks }));
  expect(markup).toContain("&lt;img src=x&gt;");
  expect(markup).not.toContain("<img");
  expect(markup).toContain("(빈 행)");
  expect(markup).toContain("<strong>삭제 · 변경 전 1행</strong>");
  expect(markup).toContain("<strong>추가 · 변경 후 2행</strong>");
  const closed = renderToStaticMarkup(createElement(TextDiff, { hunks }));
  expect(closed).toContain("텍스트로 변경 읽기");
  expect(closed).not.toContain("<ol");
});

it("states the same comparison labels in expanded text reading", () => {
  const labels: [string, string] = [
    "당시 기준본 · v14",
    "원래 전체 후보 · 읽기 전용",
  ];
  const markup = renderToStaticMarkup(
    createElement(TextDiffPages, { hunks: [], labels }),
  );
  expect(markup).toContain("당시 기준본 · v14 → 원래 전체 후보 · 읽기 전용");
  expect(markup).toContain("변경된 행이 없습니다");
});
