import { expect, it, vi } from "vitest";
import { SelectionGesture } from "../src/editor/selection-gesture";

it("measures the selection after the editor update, and cancels pending work on destroy", () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const show = vi.fn(),
    close = vi.fn(),
    dom = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const view = {
    dom,
    scrollDOM: dom,
    state: { selection: { main: { empty: false } } },
    composing: false,
  };

  try {
    const plugin = new SelectionGesture(view as never, { show, close });
    plugin.update({
      view,
      state: view.state,
      docChanged: false,
      selectionSet: true,
      transactions: [],
    } as never);
    expect(show).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
    plugin.update({
      view,
      state: view.state,
      docChanged: false,
      selectionSet: true,
      transactions: [{ isUserEvent: () => true }],
    } as never);
    expect(show).not.toHaveBeenCalled();
    while (frames.length) frames.shift()?.(0);
    expect(show).toHaveBeenCalledTimes(1);
    plugin.destroy();
    expect(dom.removeEventListener).toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("cancels pending selection work on view deactivation and does not revive it on return", () => {
  const fixture = pendingGesture();
  let enabled = true;
  const actions = {
    show: fixture.show,
    close: vi.fn(),
    enabled: () => enabled,
  };
  try {
    const plugin = new SelectionGesture(fixture.view as never, actions);
    plugin.update({ ...fixture.update, selectionSet: true } as never);
    expect(fixture.frames.size).toBe(1);
    enabled = false;
    plugin.update(fixture.update as never);
    expect(fixture.frames.size).toBe(0);
    enabled = true;
    plugin.update(fixture.update as never);
    expect(fixture.frames.size).toBe(0);
    expect(fixture.show).not.toHaveBeenCalled();
    plugin.destroy();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("discards a drag across deactivation instead of reopening on its late pointerup", () => {
  const fixture = pendingGesture();
  let enabled = true;
  try {
    const plugin = new SelectionGesture(fixture.view as never, {
      show: fixture.show,
      close: vi.fn(),
      enabled: () => enabled,
    });
    const start = fixture.view.dom.addEventListener.mock.calls.find(
      ([event]) => event === "pointerdown",
    )?.[1];
    const finish = vi
      .mocked(window.addEventListener)
      .mock.calls.find(([event]) => event === "pointerup")?.[1];
    (start as () => void)();
    enabled = false;
    plugin.update(fixture.update as never);
    enabled = true;
    (finish as () => void)();
    expect(fixture.frames.size).toBe(0);
    plugin.destroy();
  } finally {
    vi.unstubAllGlobals();
  }
});

function pendingGesture() {
  const frames = new Map<number, FrameRequestCallback>();
  let serial = 0;
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++serial, callback);
    return serial;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const dom = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const view = {
    dom,
    scrollDOM: dom,
    state: { selection: { main: { empty: false } } },
    composing: false,
  };
  const update = {
    view,
    state: view.state,
    docChanged: false,
    selectionSet: false,
    transactions: [{ isUserEvent: () => true }],
  };
  return { frames, view, update, show: vi.fn() };
}
