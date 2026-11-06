import { beforeEach, expect, it, vi } from "vitest";
import { useRegeneration } from "../src/review/useRegeneration";

const context = vi.hoisted(() => ({
  value: {} as { instruction: string; pending: unknown },
  invalidate: () => {},
  flush: async () => {},
  invoke: vi.fn(),
  effects: [] as (() => void)[],
  model: async () => ({ provider: "claude", model: "opus" }),
}));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useState: (value: unknown) => [value, () => {}],
  useEffect: (effect: () => void) => context.effects.push(effect),
}));
vi.mock("../src/generation/request-invalidation", () => ({
  useRequestInvalidation: (callback: () => void) => {
    context.invalidate = callback;
  },
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => context.invoke(...args),
}));
vi.mock("../src/connection/provider", () => ({
  modelLabel: () => "fixture",
  resolveModel: () => context.model(),
}));
vi.mock("../src/drafts/SessionDrafts", () => ({
  useSessionDraft: () => ({
    get value() {
      return context.value;
    },
    locked: false,
    set: (next: typeof context.value) => {
      context.value = next;
    },
    replace: (expected: unknown, next: typeof context.value) => {
      if (expected === context.value) context.value = next;
    },
    flush: () => context.flush(),
  }),
}));
const props = {
  proposal: { id: "proposal", revision: 1 },
  projection: {
    batch: { documentId: "doc", taskId: "task", id: "batch" },
    currentHeadId: "head",
  },
  prepare: async () => {},
  onBusy: () => {},
  onSaved: () => {},
  blocked: false,
};
beforeEach(() => {
  context.effects = [];
  context.invalidate = () => {};
  context.flush = async () => {};
  context.model = async () => ({ provider: "claude", model: "opus" });
  context.invoke.mockReset();
  context.invoke.mockResolvedValue({});
  context.value = {
    instruction: "보존할 지시",
    pending: {
      model: { provider: "claude", model: "sonnet" },
      proposalId: "proposal",
      expectedRevision: 1,
      expectedHeadId: "head",
    },
  };
});
it("clears an unsubmitted confirmation after context changes and retains the instruction", () => {
  useRegeneration(props as never);
  context.invalidate();
  expect(context.value).toEqual({ instruction: "보존할 지시", pending: null });
  expect(context.invoke).not.toHaveBeenCalled();
});
it("keeps a frozen submission while storage is pending and sends it only once", async () => {
  let release = () => {};
  context.flush = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const form = useRegeneration(props as never),
    before = context.value;
  const submission = form.submit();
  context.invalidate();
  expect(context.value).toBe(before);
  await form.submit();
  release();
  await submission;
  expect(context.invoke).toHaveBeenCalledOnce();
  expect(context.invoke.mock.calls[0][1].revision.model.model).toBe("sonnet");
});
it("rejects a late preparation after conditions or model settings change", async () => {
  context.value.pending = null;
  let release = () => {};
  let started = false;
  context.model = () =>
    new Promise((resolve) => {
      started = true;
      release = () => resolve({ provider: "claude", model: "opus" });
    });
  const form = useRegeneration(props as never);
  const preparation = form.submit();
  await vi.waitFor(() => expect(started).toBe(true));
  context.invalidate();
  release();
  await preparation;
  expect(context.value).toEqual({ instruction: "보존할 지시", pending: null });
  expect(context.invoke).not.toHaveBeenCalled();
});
