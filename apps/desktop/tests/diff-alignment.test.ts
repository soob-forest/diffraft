import type { EditorView } from "@codemirror/view";
import { expect, it } from "vitest";
import { PaneAlignment } from "../src/review/alignment";

type Measurement = { read: () => unknown; write: (value: unknown) => void };
function pane() {
  const queued: Measurement[] = [];
  let extra = new Map<number, number>();
  let height = 26;
  const view = {
    contentDOM: {
      querySelectorAll: () => [{ getBoundingClientRect: () => ({ height }) }],
    },
    posAtDOM: () => 0,
    scaleY: 1,
    state: {
      field: () => extra,
      doc: {
        lineAt: () => ({ number: 1, from: 0 }),
        line: () => ({ from: 0 }),
      },
    },
    requestMeasure: (request: Measurement) => queued.push(request),
    dispatch: (spec: { effects: { value: Map<number, number> } }) => {
      extra = spec.effects.value;
    },
  };
  return {
    view: view as unknown as EditorView,
    queued,
    resize: (value: number) => {
      height = value;
    },
    padding: () => extra.get(0) ?? 0,
  };
}
it("remeasures geometry that changed while a previous measure was still pending", async () => {
  const alignment = new PaneAlignment();
  const left = pane();
  const right = pane();
  alignment.register("before", left.view);
  alignment.register("after", right.view);
  const first = left.queued.shift();
  if (!first) throw new Error("측정 요청이 없습니다.");
  const initial = first.read();
  right.resize(78);
  alignment.measure();
  first.write(initial);
  await Promise.resolve();
  const next = left.queued.shift();
  expect(next).toBeDefined();
  if (!next) return;
  next.write(next.read());
  await Promise.resolve();
  expect(left.padding()).toBe(52);
  expect(right.padding()).toBe(0);
});

it("discards a pending measure when its pane was replaced", async () => {
  const alignment = new PaneAlignment();
  const left = pane();
  const oldRight = pane();
  const newRight = pane();
  alignment.register("before", left.view);
  alignment.register("after", oldRight.view);
  const old = left.queued.shift();
  if (!old) throw new Error("측정 요청이 없습니다.");
  const oldHeights = old.read();
  alignment.register("after", newRight.view);
  newRight.resize(104);
  old.write(oldHeights);
  await Promise.resolve();
  const next = left.queued.shift();
  if (!next) throw new Error("새 측정 요청이 없습니다.");
  next.write(next.read());
  await Promise.resolve();
  expect(left.padding()).toBe(78);
  expect(oldRight.padding()).toBe(0);
});
