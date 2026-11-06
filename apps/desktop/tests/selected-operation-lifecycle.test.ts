import { expect, it, vi } from "vitest";
import { useSelectedGeneration } from "../src/review/useSelectedGeneration";

vi.mock("../src/generation/request-invalidation", () => ({
  useRequestInvalidation: () => {},
}));
const lifecycle = vi.hoisted(() => ({ cleanup: () => {} }));
vi.mock("react", () => ({
  useState: (value: unknown) => [value, () => {}],
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (effect: () => () => void) => {
    const cleanup = effect();
    if (cleanup) lifecycle.cleanup = cleanup;
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
    selection: { locked: false, draft: { value: { prepareOnOpen: false } } },
    onBusy: busy,
  } as never);
  await form.prepare();
  expect(busy.mock.calls).toEqual([[true], [false]]);
});
