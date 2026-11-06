import { beforeEach, expect, it, vi } from "vitest";
import { useSelectedGeneration } from "../src/review/useSelectedGeneration";

const context = vi.hoisted(() => ({
  invalidate: () => {},
  release: () => {},
  hold: false,
}));
vi.mock("react", () => ({
  useState: (value: unknown) => [value, () => {}],
  useRef: (value: unknown) => ({ current: value }),
  useEffect: () => {},
}));
vi.mock("../src/generation/request-invalidation", () => ({
  useRequestInvalidation: (action: () => void) => {
    context.invalidate = action;
  },
}));
vi.mock("../src/review/selected-request-operations", () => ({
  prepareSelected: vi.fn(),
  saveDirectSelection: vi.fn(),
  confirmSelected: () =>
    context.hold
      ? new Promise<void>((resolve) => {
          context.release = resolve;
        })
      : Promise.resolve(),
}));
beforeEach(() => {
  context.hold = false;
});
function useFixture() {
  let value = {
    instruction: "보존할 지시",
    prepareOnOpen: false,
    prepared: { request: "고정한 요청" },
  } as unknown;
  const draft = {
    get value() {
      return value;
    },
    replace: (expected: unknown, next: unknown) => {
      if (value === expected) value = next;
    },
  };
  const form = useSelectedGeneration({
    selection: { locked: false, draft },
    onBusy: () => {},
    onSaved: () => {},
  } as never);
  return { form, value: () => value };
}
it("invalidates a selected confirmation after a context change while preserving its instruction", () => {
  const f = useFixture();
  context.invalidate();
  expect(f.value()).toMatchObject({
    instruction: "보존할 지시",
    prepared: null,
  });
});
it("does not change the frozen confirmation of a request already executing", async () => {
  context.hold = true;
  const f = useFixture(),
    before = f.value();
  const running = f.form.confirm();
  context.invalidate();
  expect(f.value()).toBe(before);
  context.release();
  await running;
});
