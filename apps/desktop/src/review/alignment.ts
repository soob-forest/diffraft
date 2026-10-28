import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { PaneSide } from "./coordinates";

type Heights = Map<number, number>;
const PIXEL_TOLERANCE = 0.5;
const setPadding = StateEffect.define<Heights>();
const padding = StateField.define<Heights>({
  create: () => new Map(),
  update: (value, transaction) => {
    for (const effect of transaction.effects)
      if (effect.is(setPadding)) return effect.value;
    return value;
  },
  provide: (field) =>
    EditorView.decorations.from(field, (values) =>
      Decoration.set(
        [...values]
          .sort(([a], [b]) => a - b)
          .map(([position, height]) =>
            Decoration.line({
              attributes: { style: `padding-bottom: ${height}px` },
            }).range(position),
          ),
      ),
    ),
});

export function alignmentExtension(onMeasure: () => void) {
  return [
    padding,
    EditorView.updateListener.of((update) => {
      if (update.geometryChanged || update.viewportChanged) onMeasure();
    }),
  ];
}

export function alignedPadding(left: number, right: number): [number, number] {
  const height = Math.max(left, right);
  return [height - left, height - right];
}

export class PaneAlignment {
  private views = new Map<PaneSide, EditorView>();
  private pending = false;
  private dirty = false;
  private epoch = 0;
  register(side: PaneSide, view: EditorView | null) {
    this.epoch++;
    this.pending = false;
    this.dirty = false;
    if (view) this.views.set(side, view);
    else this.views.delete(side);
    this.measure();
  }
  measure() {
    const left = this.views.get("before");
    const right = this.views.get("after");
    if (!left || !right) return;
    if (this.pending) {
      this.dirty = true;
      return;
    }
    this.pending = true;
    const epoch = this.epoch;
    left.requestMeasure({
      read: () =>
        epoch === this.epoch
          ? [naturalHeights(left), naturalHeights(right)]
          : null,
      write: (heights) => {
        // State dispatch must run after CodeMirror's measurement update finishes.
        queueMicrotask(() => {
          if (!heights || epoch !== this.epoch) return;
          this.pending = false;
          const again = this.dirty;
          this.dirty = false;
          align(left, right, heights);
          if (again) this.measure();
        });
      },
    });
  }
}

function naturalHeights(view: EditorView): Heights {
  const previous = view.state.field(padding);
  const result: Heights = new Map();
  for (const element of view.contentDOM.querySelectorAll(".cm-line")) {
    const line = view.state.doc.lineAt(view.posAtDOM(element));
    const height = element.getBoundingClientRect().height / view.scaleY;
    result.set(line.number, height - (previous.get(line.from) ?? 0));
  }
  return result;
}

function align(left: EditorView, right: EditorView, heights: Heights[]) {
  const nextLeft = new Map(left.state.field(padding));
  const nextRight = new Map(right.state.field(padding));
  for (const [line, height] of heights[0]) {
    const other = heights[1].get(line);
    if (other === undefined) continue;
    const [a, b] = alignedPadding(height, other);
    nextLeft.set(left.state.doc.line(line).from, a);
    nextRight.set(right.state.doc.line(line).from, b);
  }
  applyPadding(left, nextLeft);
  applyPadding(right, nextRight);
}

function applyPadding(view: EditorView, next: Heights) {
  const previous = view.state.field(padding);
  if (
    ![...next].some(
      ([position, height]) =>
        Math.abs((previous.get(position) ?? 0) - height) > PIXEL_TOLERANCE,
    )
  )
    return;
  view.dispatch({ effects: setPadding.of(next) });
}
