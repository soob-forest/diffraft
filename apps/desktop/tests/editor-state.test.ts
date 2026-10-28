import { describe, expect, it } from "vitest";
import { mergeEditorRead } from "../src/editor/editor-state";
import type { EditorState } from "../src/generated/EditorState";

const state = {
  document: { id: "doc", version: 12 },
  tasks: [{ id: "task", goal: "처음 조건" }],
  versions: [],
  headings: [],
} as unknown as EditorState;
describe("editor refresh after local changes", () => {
  it("does not undo a working-file change with an older read of the same version", () => {
    const current = {
      ...state,
      document: { ...state.document, path: "/new.md" },
    };
    const old = { ...state, document: { ...state.document, path: "/old.md" } };
    expect(mergeEditorRead(current, old, false)).toBe(current);
  });
  it("retains a task saved after the read began", () => {
    const current = {
      ...state,
      tasks: [{ ...state.tasks[0], goal: "방금 저장한 조건" }],
    };
    expect(mergeEditorRead(current, state, true).tasks[0].goal).toBe(
      "방금 저장한 조건",
    );
  });
  it("does not replace an approved head with an older read", () => {
    const current = { ...state, document: { ...state.document, version: 13 } };
    expect(mergeEditorRead(current, state, false)).toBe(current);
  });
  it("refreshes tasks when no local task save happened during the read", () => {
    const incoming = {
      ...state,
      tasks: [{ ...state.tasks[0], goal: "DB의 조건" }],
    };
    expect(mergeEditorRead(state, incoming, false)).toBe(incoming);
  });
});
