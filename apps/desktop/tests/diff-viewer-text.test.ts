import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { DiffHunk } from "../src/generated/DiffHunk";
import { DiffViewer } from "../src/review/DiffViewer";
import type { GroupMark } from "../src/review/group-selection";
import { changedTextLines, textDiffLine } from "../src/review/text-diff-model";
import { unitComparisonLabels } from "../src/review/unit-comparison-labels";
import { projection, proposal } from "./support/review-projection";

type TextProps = {
  hunks: DiffHunk[];
  markers?: Map<string, GroupMark>;
  labels?: [string, string];
  selectedGroup?: string;
  jump?: { serial: number; rowKey: string } | null;
};
const captured = vi.hoisted(() => [] as TextProps[]);
vi.mock("../src/review/TextDiff", () => ({
  TextDiff: (props: TextProps) => {
    captured.push(props);
    return null;
  },
}));
beforeEach(() => {
  captured.length = 0;
});

function comparison(original: boolean) {
  const view = projection([
    proposal({
      id: "first",
      groupId: "one",
      operation: { ...proposal().operation, range: { from: 0, to: 2 } },
    }),
    proposal({
      id: "second",
      groupId: "two",
      operation: { ...proposal().operation, range: { from: 2, to: 4 } },
    }),
  ]);
  view.before = original ? "a\nb\n" : "A\nb\n";
  view.after = "A\nB\n";
  view.batch.mode = "REWRITE";
  view.batch.reviewUnits = view.batch.proposals.map((entry, index) => ({
    id: entry.groupId,
    planId: "plan",
    number: index ? 9 : 4,
    title: entry.id,
    kind: "modify",
    reason: "reason",
    reviewRevision: 1,
    proposals: [{ id: entry.id, revision: 1 }],
  }));
  view.groups = view.groups.map((group, index) => ({
    ...group,
    afterRanges: [{ from: index * 2, to: index * 2 + 2 }],
  }));
  if (!original) view.groups = view.groups.slice(1);
  view.hunks = [comparisonHunk(original)];
  return view;
}

function comparisonHunk(original: boolean): DiffHunk {
  return {
    oldRange: { from: original ? 0 : 2, to: 4 },
    newRange: { from: original ? 0 : 2, to: 4 },
    groupIds: original ? ["one", "two"] : ["two"],
    lines: (original ? [1, 2] : [2]).flatMap((number) => [
      {
        kind: "delete",
        oldLine: number,
        newLine: null,
        segments: [{ text: `${number === 1 ? "a" : "b"}\n`, changed: true }],
      },
      {
        kind: "insert",
        oldLine: null,
        newLine: number,
        segments: [{ text: `${number === 1 ? "A" : "B"}\n`, changed: true }],
      },
    ]),
  };
}

it("passes the displayed projection and the exact visual row markers to text reading", () => {
  for (const original of [false, true]) {
    const view = comparison(original);
    const labels = unitComparisonLabels(view, [], original);
    const jump = {
      serial: 7,
      selection: { side: "before" as const, from: 2, to: 2 },
    };
    renderToStaticMarkup(
      createElement(DiffViewer, {
        projection: view,
        labels,
        selectedGroup: "two",
        onMove: () => {},
        onSelection: () => {},
        jump,
      }),
    );
    const text = captured.at(-1);
    expect(text?.hunks).toBe(view.hunks);
    expect(text?.labels).toBe(labels);
    expect(text?.selectedGroup).toBe("two");
    expect(text?.jump).toEqual({ serial: 7, rowKey: "delete:2:null" });
    const rows = changedTextLines(text?.hunks ?? []).map((row) =>
      textDiffLine(row, text?.markers),
    );
    expect(rows.at(-1)?.label).toContain("변경 9 · second · 선택됨");
    expect(rows[0].label).toContain(
      original ? "변경 4 · first" : "변경 9 · second",
    );
    expect(rows).toHaveLength(original ? 4 : 2);
  }
});

it("preserves explicit textDetails=false for the existing PATCH path", () => {
  renderToStaticMarkup(
    createElement(DiffViewer, {
      projection: comparison(false),
      textDetails: false,
      onMove: () => {},
      onSelection: () => {},
      jump: null,
    }),
  );
  expect(captured).toHaveLength(0);
});
