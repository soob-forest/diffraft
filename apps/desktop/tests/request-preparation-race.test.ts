import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { completeShutdown } from "../src/connection/api";
import { DraftPersistence } from "../src/drafts/persistence";
import { DraftStore } from "../src/drafts/store";
import { useGeneration } from "../src/generation/useGeneration";
import { useSelectedGeneration } from "../src/review/useSelectedGeneration";
import { useSelectedRequest } from "../src/review/useSelectedRequest";
import { createCloseRequest } from "../src/useAppClose";

const c = vi.hoisted(() => ({
  store: null as unknown as DraftStore,
  persistence: null as unknown as DraftPersistence,
  invalidations: [] as (() => void)[],
  model: async () => ({ provider: "claude", model: "sonnet" }),
  afterFlush: () => {},
}));
vi.mock("react", () => ({
  useState: (value: unknown) => [
    typeof value === "function" ? value() : value,
    () => {},
  ],
  useRef: (current: unknown) => ({ current }),
  useEffect: () => {},
  useMemo: (action: () => unknown) => action(),
}));
vi.mock("../src/generation/request-invalidation", () => ({
  useRequestInvalidation: (callback: () => void) =>
    c.invalidations.push(callback),
}));
vi.mock("../src/drafts/SessionDrafts", () => ({
  useDraftPersistence: () => ({
    store: c.store,
    flush: async () => {
      await c.persistence.flush();
      c.afterFlush();
    },
  }),
  useSessionDraft: (key: string, initial: unknown) => ({
    value: c.store.read(key, initial),
    locked: false,
    flush: c.persistence.flush,
    set: (value: unknown) => c.store.write(key, value),
    replace: (old: unknown, next: unknown) => c.store.replace(key, old, next),
    update: (action: (value: unknown) => unknown) =>
      c.store.update(key, initial, action),
  }),
}));
vi.mock("../src/connection/provider", () => ({
  resolveModel: () => c.model(),
  modelLabel: () => "fixture",
}));
vi.mock("../src/editor/api", () => ({
  editorCommand: async () => ({
    text: "문서",
    version: 1,
    versionId: "head",
    blocks: [],
  }),
}));
vi.mock("../src/review/api", () => ({
  reviewCommand: async (action: { kind: string; request?: unknown }) =>
    action.kind === "state"
      ? { generating: false, sequence: 1, batches: [] }
      : { request: action.request, context: "{}" },
}));
vi.mock("../src/connection/api", () => ({ completeShutdown: vi.fn() }));
const documentId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000002";
beforeEach(async () => {
  vi.clearAllMocks();
  c.invalidations = [];
  c.afterFlush = () => {};
  c.store = new DraftStore();
  c.persistence = new DraftPersistence(c.store, {
    read: async () => [],
    write: async (write) => {
      const parts = JSON.parse(write.key);
      // Matches domain::drafts::DraftWrite::validate -> document::validate_id.
      if (!parts[2]) throw new Error("올바르지 않은 작업 식별자입니다.");
      return { ...write, revision: write.expectedRevision + 1, updatedAt: 0 };
    },
  });
  await c.persistence.load();
});
afterEach(() => c.persistence.dispose());
it("dismisses before task creation without blocking later drafts or shutdown", async () => {
  const firstKey = JSON.stringify(["first-request", documentId, taskId]);
  const first = { instruction: "취소 전 첫 지시" };
  c.store.write(firstKey, first);
  const selected = useSelectedRequest(documentId, "", "source");
  expect(await selected.dismiss()).toBe(true);
  const invalid = JSON.stringify([
    "selected-request",
    documentId,
    "",
    "source-empty",
  ]);
  expect(c.store.hasChanges(invalid)).toBe(false);
  expect(c.store.peek(firstKey)).toBe(first);
  expect(c.persistence.status()).not.toContain("실패");
  c.store.write(JSON.stringify(["first-request", documentId, taskId]), {
    instruction: "새 첫 요청",
  });
  await expect(c.persistence.flush()).resolves.toBeUndefined();
  const errors: string[] = [];
  const close = createCloseRequest({
    lock: { current: false },
    flush: c.persistence.flush,
    onError: (error) => errors.push(error),
    onClosing: () => {},
  });
  await close({ preventDefault: () => {} });
  expect(errors).toEqual([]);
  expect(completeShutdown).toHaveBeenCalledOnce();
});
function delayedModel() {
  let started = false,
    release = () => {};
  c.model = () =>
    new Promise((resolve) => {
      started = true;
      release = () => resolve({ provider: "claude", model: "sonnet" });
    });
  return { started: () => started, release: () => release() };
}
function selectedTarget(kind: string) {
  return {
    kind,
    documentId,
    expectedHeadId: "head",
    batchId: "batch",
    proposalId: "proposal",
    expectedRevision: 1,
    selection: { taskId, fromUtf16: 0, toUtf16: 2, quote: "문서" },
    candidate: "문서",
    title: "선택 대상",
  };
}
it.each([
  ["confirmed", true],
  ["candidate", true],
  ["rewrite", true],
  ["confirmed", false],
  ["candidate", false],
  ["rewrite", false],
])(
  "selected %s preparation checks changes while resolving its model: %s",
  async (kind, invalidate) => {
    const surface = kind === "confirmed" ? "source" : "review";
    const selected = useSelectedRequest(documentId, taskId, surface);
    const target = selectedTarget(String(kind));
    selected.beginTarget(target as never);
    const current = useSelectedRequest(documentId, taskId, surface);
    current.draft.set({ ...current.draft.value, instruction: "수정" });
    const latest = useSelectedRequest(documentId, taskId, surface);
    const hold = delayedModel();
    const form = useSelectedGeneration({
      selection: latest,
      prepare: async () => {},
      onBusy: () => {},
      onSaved: () => {},
    });
    const work = form.prepare();
    await vi.waitFor(() => expect(hold.started()).toBe(true));
    if (invalidate) for (const callback of c.invalidations) callback();
    hold.release();
    await work;
    const index = c.store.peek(
      JSON.stringify([
        "selected-request",
        documentId,
        taskId,
        surface === "source" ? "source-active" : "active",
      ]),
    ) as { key: string };
    const value = c.store.peek(index.key) as {
      prepared: { value: { request: { model: { model: string } } } };
    };
    expect(value).toMatchObject({ instruction: "수정", target });
    if (invalidate) expect(value.prepared).toBeNull();
    else expect(value.prepared.value.request.model.model).toBe("sonnet");
  },
);
function generalProps() {
  const model = {
    state: { document: { id: documentId } },
    content: "문서",
    status: { dirty: false, saving: false, error: "" },
    gate: { run: (action: () => unknown) => action() },
    autosave: {
      flush: async () => {},
      document: {
        id: documentId,
        versionId: "head",
        version: 1,
        content: "문서",
      },
    },
  };
  return {
    model,
    taskId,
    scope: { value: () => ({ kind: "whole" }) },
    taskFlush: { current: null },
    onProposal: () => {},
  } as never;
}
it.each([
  ["PATCH", true],
  ["EXPLAIN", true],
  ["REWRITE", true],
  ["PATCH", false],
  ["EXPLAIN", false],
  ["REWRITE", false],
])("general %s preparation checks changes: %s", async (mode, invalidate) => {
  c.store.write(JSON.stringify(["request", documentId, taskId]), {
    mode,
    instruction: "수정",
  });
  const hold = delayedModel();
  const form = useGeneration(generalProps());
  const work = form.prepare();
  await vi.waitFor(() => expect(hold.started()).toBe(true));
  if (invalidate) for (const callback of c.invalidations) callback();
  hold.release();
  await work;
  const value = c.store.peek(
    JSON.stringify(["request", documentId, taskId]),
  ) as { pending: { request: { model: { model: string } } } };
  if (invalidate) expect(value.pending ?? null).toBeNull();
  else expect(value.pending.request.model.model).toBe("sonnet");
  expect(value).toMatchObject({ mode, instruction: "수정" });
});
it.each(["PATCH", "EXPLAIN", "REWRITE"])(
  "discards %s preparation invalidated during the final draft flush",
  async (mode) => {
    const key = JSON.stringify(["request", documentId, taskId]);
    c.store.write(key, { mode, instruction: "저장 중에도 보존할 지시" });
    c.model = async () => ({ provider: "claude", model: "sonnet" });
    c.afterFlush = () => {
      for (const callback of c.invalidations) callback();
    };
    await useGeneration(generalProps()).prepare();
    const value = c.store.peek(key) as { pending?: unknown };
    expect(value.pending ?? null).toBeNull();
    expect(value).toMatchObject({
      mode,
      instruction: "저장 중에도 보존할 지시",
    });
  },
);
