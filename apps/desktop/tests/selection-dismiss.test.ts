import { afterEach, expect, it, vi } from "vitest";
import { SelectionDismissGesture } from "../src/editor/selection-dismiss";

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const frames = new Map<number, FrameRequestCallback>();
  let serial = 0,
    enabled = true,
    control = false;
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++serial, callback);
    return serial;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const dom = Object.assign(new EventTarget(), {
    closest: () => (control ? {} : null),
  });
  const view = {
    dom,
    scrollDOM: new EventTarget(),
    composing: false,
    state: { selection: { main: { empty: true } } },
  };
  const dismiss = vi.fn();
  const gesture = new SelectionDismissGesture(view as never, {
    enabled: () => enabled,
    dismiss,
  });
  const event = (type: string, overrides = {}) =>
    dom.dispatchEvent(
      Object.assign(new Event(type), {
        button: 0,
        isPrimary: true,
        clientX: 10,
        clientY: 10,
        ...overrides,
      }),
    );
  const drain = () => drainFrames(frames);
  return {
    view,
    event,
    dismiss,
    gesture,
    drain,
    disable: () => {
      enabled = false;
    },
    control: () => {
      control = true;
    },
  };
}
it("dismisses a collapsed editor click after the selection update", () => {
  const f = fixture();
  f.event("pointerdown");
  f.event("click");
  expect(f.dismiss).not.toHaveBeenCalled();
  f.drain();
  expect(f.dismiss).toHaveBeenCalledOnce();
  f.gesture.destroy();
});
it("preserves a new drag, composition, disabled composer and scrolling", () => {
  const f = fixture();
  f.event("pointerdown");
  f.event("click", { clientX: 80 });
  f.drain();
  f.view.state.selection.main.empty = false;
  f.event("pointerdown");
  f.event("click");
  f.drain();
  f.view.state.selection.main.empty = true;
  f.view.composing = true;
  f.event("pointerdown");
  f.event("click");
  f.drain();
  f.view.composing = false;
  f.event("pointerdown");
  f.view.scrollDOM.dispatchEvent(new Event("wheel"));
  f.event("click");
  f.drain();
  f.event("pointerdown");
  f.event("click");
  f.disable();
  f.drain();
  expect(f.dismiss).not.toHaveBeenCalled();
  f.gesture.destroy();
});
it("does not mistake caret scrolling during a completed click for a scroll gesture", () => {
  const f = fixture();
  f.event("pointerdown");
  f.view.scrollDOM.dispatchEvent(new Event("scroll"));
  f.event("click");
  f.view.scrollDOM.dispatchEvent(new Event("scroll"));
  f.drain();
  expect(f.dismiss).toHaveBeenCalledOnce();
  f.gesture.destroy();
});
it("ignores controls and cancels pending work on blur, pointer cancellation and destroy", () => {
  const f = fixture();
  f.control();
  f.event("pointerdown");
  f.event("click");
  f.drain();
  expect(f.dismiss).not.toHaveBeenCalled();
  f.gesture.destroy();
});
it("cancels pending work on blur, pointer cancellation and destroy", () => {
  const f = fixture();
  f.event("pointerdown");
  window.dispatchEvent(new Event("pointercancel"));
  f.event("click");
  f.drain();
  f.event("pointerdown");
  f.event("click");
  window.dispatchEvent(new Event("blur"));
  f.drain();
  f.event("pointerdown");
  f.event("click");
  f.gesture.destroy();
  f.drain();
  expect(f.dismiss).not.toHaveBeenCalled();
});

function drainFrames(frames: Map<number, FrameRequestCallback>) {
  while (frames.size) {
    const entry = frames.entries().next().value;
    if (!entry) break;
    const [id, callback] = entry;
    frames.delete(id);
    callback(0);
  }
}
