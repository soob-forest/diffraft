import { beforeEach, expect, it, vi } from "vitest";
import { usePendingReviewValidity } from "../src/generation/usePendingReviewValidity";

const c = vi.hoisted(() => ({
  effect: () => undefined as undefined | (() => void),
  read: vi.fn(),
}));
vi.mock("react", () => ({
  useEffect: (effect: typeof c.effect) => {
    c.effect = effect;
  },
}));
vi.mock("../src/review/api", () => ({
  reviewCommand: (...args: unknown[]) => c.read(...args),
}));
beforeEach(() => vi.clearAllMocks());
function useFixture() {
  const close = vi.fn(),
    report = vi.fn();
  usePendingReviewValidity({
    taskId: "task",
    pending: { reviewSequence: 0, request: { expectedActiveBatchId: "new" } },
    review: { loading: false, state: { sequence: 0, batches: [] } },
    close,
    report,
  } as never);
  return { close, report, cleanup: c.effect() };
}
it("keeps a fresh confirmation when only the cached poll has an older active batch", async () => {
  c.read.mockResolvedValue({
    sequence: 0,
    batches: [{ id: "new", status: "ACTIVE" }],
  });
  const f = useFixture();
  await vi.waitFor(() => expect(c.read).toHaveBeenCalledOnce());
  expect(f.close).not.toHaveBeenCalled();
});
it.each([
  { sequence: 0, batches: [{ id: "other", status: "ACTIVE" }] },
  { sequence: 1, batches: [{ id: "new", status: "ACTIVE" }] },
])(
  "closes a confirmation for an actual stored review change: %s",
  async (state) => {
    c.read.mockResolvedValue(state);
    const f = useFixture();
    await vi.waitFor(() => expect(f.close).toHaveBeenCalledOnce());
  },
);
it("closes and explains a failed verification while retaining the draft", async () => {
  c.read.mockRejectedValue(new Error("fixture storage unavailable"));
  const f = useFixture();
  await vi.waitFor(() => expect(f.close).toHaveBeenCalledOnce());
  expect(f.report).toHaveBeenCalledWith(expect.stringContaining("다시 확인"));
});
it("does not close another confirmation after cleanup during the stored read", async () => {
  let release = (_value: unknown) => {};
  c.read.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const f = useFixture();
  f.cleanup?.();
  release({ sequence: 1, batches: [] });
  await Promise.resolve();
  expect(f.close).not.toHaveBeenCalled();
});
