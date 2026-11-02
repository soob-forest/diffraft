import { expect, it, vi } from "vitest";
import { useSelectedGeneration } from "../src/review/useSelectedGeneration";

const lifecycle = vi.hoisted(() => ({ cleanup: () => {} }));
vi.mock("react", () => ({
  useState: (value: unknown) => [value, () => {}],
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (effect: () => () => void) => {
    lifecycle.cleanup = effect();
  },
}));
vi.mock("../src/review/selected-request-operations", () => ({
  prepareSelected: async () => {
    lifecycle.cleanup();
  },
  confirmSelected: vi.fn(),
  saveDirectSelection: vi.fn(),
}));
it("releases the parent busy state when the composer unmounts during an operation", async () => {
  const busy = vi.fn();
  const form = useSelectedGeneration({
    selection: { locked: false },
    onBusy: busy,
  } as never);
  await form.prepare();
  expect(busy.mock.calls).toEqual([[true], [false]]);
});
