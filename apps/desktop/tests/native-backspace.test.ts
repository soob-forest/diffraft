import { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { nativeBackspaceKeymap } from "../src/editor/native-backspace";

describe("native Korean Backspace", () => {
  it("leaves a single selection to the macOS input method", () => {
    const run = vi.fn(() => true);
    const [binding] = nativeBackspaceKeymap([
      { key: "Backspace", run, shift: run, preventDefault: true },
    ]);
    const view = { state: EditorState.create() } as EditorView;
    expect(binding.run?.(view)).toBe(false);
    expect(binding.shift?.(view)).toBe(false);
    expect(binding.preventDefault).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
  it("keeps modifier bindings and readonly prevention", () => {
    const modifier = { key: "Mod-Backspace" };
    const bindings = nativeBackspaceKeymap([
      modifier,
      { key: "Backspace", preventDefault: true },
    ]);
    expect(bindings[0]).toBe(modifier);
    expect(
      bindings[1].run?.({
        state: EditorState.create({
          extensions: [EditorState.readOnly.of(true)],
        }),
      } as EditorView),
    ).toBe(true);
  });
});
