import { StateEffect } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  keymap,
  ViewPlugin,
} from "@codemirror/view";
import { rawSource } from "./raw-history";
import { selectionGesture } from "./selection-gesture";
import { displayOffset, sourceOffset } from "./source-buffer";
import {
  type CapturedSourceSelection,
  captureSourceSelection,
} from "./source-selection";
import type { SourceSelectionAction } from "./useSourceRequest";

export type SourceEditorAction = {
  active: boolean;
  onPosition: (value: SourceSelectionAction | null) => void;
  edit: (captured: CapturedSourceSelection) => void;
  pinned: CapturedSourceSelection | null;
  returnSerial: number;
};
export const refreshSourcePin =
  StateEffect.define<CapturedSourceSelection | null>();
export function sourceAction(view: EditorView): SourceSelectionAction | null {
  const selection = view.state.selection.main,
    raw = view.state.field(rawSource);
  if (
    selection.empty ||
    view.state.selection.ranges.length !== 1 ||
    view.composing
  )
    return null;
  const rect = view.coordsAtPos(selection.head);
  if (!rect) return null;
  const captured = captureSourceSelection(raw, {
    from: sourceOffset(raw, selection.from),
    to: sourceOffset(raw, selection.to),
    cursor: sourceOffset(raw, selection.head),
  });
  return {
    captured,
    position: {
      left: rect.left,
      top: rect.bottom,
      above: rect.top,
      right: view.scrollDOM.getBoundingClientRect().right,
    },
  };
}
export function sourceActionExtensions(
  current: React.RefObject<{ action?: SourceEditorAction }>,
) {
  const close = () => current.current.action?.onPosition(null);
  const show = (view: EditorView, focus: boolean) => {
    if (!current.current.action?.active) return false;
    const value = sourceAction(view);
    if (!value) return false;
    current.current.action.onPosition({
      ...value,
      position: { ...value.position, focus },
    });
    return true;
  };
  return [
    selectionGesture({
      show,
      close,
      enabled: () => Boolean(current.current.action?.active),
    }),
    keymap.of([
      { key: "Shift-F10", run: (view) => show(view, true) },
      {
        key: "Mod-Shift-Enter",
        run: (view) => {
          const value = sourceAction(view);
          if (!value || !current.current.action?.active) return false;
          current.current.action.edit(value.captured);
          return true;
        },
      },
      {
        key: "Escape",
        run: () => {
          close();
          return false;
        },
      },
    ]),
    sourcePin(current),
    sourceContextEvents(current, show),
  ];
}
function sourceContextEvents(
  current: React.RefObject<{ action?: SourceEditorAction }>,
  show: (view: EditorView, focus: boolean) => boolean,
) {
  return ViewPlugin.fromClass(
    class {
      constructor(private view: EditorView) {
        view.dom.addEventListener("contextmenu", this.context);
      }
      private context = (event: MouseEvent) => {
        if (show(this.view, false)) event.preventDefault();
      };
      destroy() {
        this.view.dom.removeEventListener("contextmenu", this.context);
        current.current.action?.onPosition(null);
      }
    },
  );
}
function sourcePin(current: React.RefObject<{ action?: SourceEditorAction }>) {
  const decorations = (view: EditorView) => {
    const pin = current.current.action?.pinned,
      raw = view.state.field(rawSource);
    if (!current.current.action?.active || !pin || pin.source !== raw)
      return Decoration.none;
    return Decoration.set([
      Decoration.mark({ class: "source-pinned-selection" }).range(
        displayOffset(raw, pin.selection.from),
        displayOffset(raw, pin.selection.to),
      ),
    ]);
  };
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorations(view);
      }
      update(update: { view: EditorView }) {
        this.decorations = decorations(update.view);
      }
    },
    { decorations: (value) => value.decorations },
  );
}
