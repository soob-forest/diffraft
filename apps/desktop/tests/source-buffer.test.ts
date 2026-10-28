import { history, isolateHistory, redo, undo } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { rawSource, sourceHistory } from "../src/editor/raw-history";
import {
  applySourceChanges,
  displayOffset,
  displayText,
  sourceOffset,
} from "../src/editor/source-buffer";

describe("exact source buffer", () => {
  it("keeps BOM, untouched mixed newlines, Korean and emoji", () => {
    const raw = "\ufeff# 제목\r\n한😀\n끝\r마지막";
    const display = displayText(raw);
    const from = display.indexOf("한");
    const result = applySourceChanges(raw, [
      { from, to: from + 1, insert: "하\n나" },
    ]);
    expect(result).toBe("\ufeff# 제목\r\n하\r\n나😀\n끝\r마지막");
    expect(sourceOffset(raw, from)).toBe(raw.indexOf("한"));
    expect(displayOffset(raw, raw.indexOf("끝"))).toBe(display.indexOf("끝"));
  });
  it("applies disjoint changes in old coordinates and rejects overlap", () => {
    expect(
      applySourceChanges("a\r\nb\n", [
        { from: 0, to: 1, insert: "AA" },
        { from: 2, to: 3, insert: "B" },
      ]),
    ).toBe("AA\r\nB\n");
    expect(() =>
      applySourceChanges("abc", [
        { from: 0, to: 2, insert: "" },
        { from: 1, to: 3, insert: "" },
      ]),
    ).toThrow();
  });
  it("undo and redo restore exact deleted mixed newline bytes across grouped edits", () => {
    const raw = "\ufeff한\r\n😀\n끝\r마지막";
    let state = EditorState.create({
      doc: displayText(raw),
      extensions: [history(), sourceHistory(raw)],
    });
    state = state.update({
      changes: { from: 1, to: 8, insert: "대체" },
      userEvent: "input.type",
    }).state;
    state = state.update({
      changes: { from: 1, insert: "더" },
      userEvent: "input.type",
    }).state;
    const after = state.field(rawSource);
    const target = {
      get state() {
        return state;
      },
      dispatch(
        transaction:
          | Parameters<typeof state.update>[0]
          | ReturnType<typeof state.update>,
      ) {
        state =
          "state" in transaction
            ? transaction.state
            : state.update(transaction).state;
      },
    };
    expect(undo(target)).toBe(true);
    expect(state.field(rawSource)).toBe(raw);
    expect(redo(target)).toBe(true);
    expect(state.field(rawSource)).toBe(after);
    state = state.update({
      changes: { from: 0, insert: "추가" },
      annotations: isolateHistory.of("full"),
    }).state;
    expect(undo(target)).toBe(true);
    expect(state.field(rawSource)).toBe(after);
  });
});
