import { beforeEach, expect, it, vi } from "vitest";
import { DraftStore } from "../src/drafts/store";
import { useRequestScope } from "../src/editor/request-scope";
import { captureSourceSelection } from "../src/editor/source-selection";
import type { GenerationAttempt } from "../src/generated/GenerationAttempt";
import { useGeneration } from "../src/generation/useGeneration";
import { openFailedSelectionDraft } from "../src/review/failed-selection-draft";
import type { SelectedTarget } from "../src/review/selection-targets";
import {
  legacySelectionTargetKey,
  selectedRequestTarget,
  selectionTargetKey,
} from "../src/review/selection-targets";
import { useSelectedRequest } from "../src/review/useSelectedRequest";
import { projection } from "./support/review-projection";
import { failedSelectionRequest as failedRequest } from "./support/selection-recovery";

const context = vi.hoisted(() => ({ store: null as unknown as DraftStore }));
vi.mock("react", () => ({
  useState: (initial: unknown) => [initial, () => {}],
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: () => {},
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("../src/drafts/SessionDrafts", () => ({
  useDraftPersistence: () => ({ store: context.store, flush: async () => {} }),
  useSessionDraft: (key: string, initial: unknown) => ({
    value: context.store.read(key, initial),
    locked: context.store.isBlocked(key),
    update: (transform: (value: unknown) => unknown) =>
      context.store.update(key, initial, transform),
    set: (value: unknown) => context.store.write(key, value),
    replace: (expected: unknown, value: unknown) =>
      context.store.replace(key, expected, value),
    flush: async () => {},
  }),
}));

beforeEach(() => {
  context.store = new DraftStore();
});
function candidateProjection(headId = "head1") {
  const value = projection();
  value.currentHeadId = headId;
  value.batch.applyHeadId = headId;
  value.groups[0].afterRanges[0].to = new TextEncoder().encode(
    value.after,
  ).length;
  return value;
}
const selected = () => useSelectedRequest("document1", "task1");
const range = { side: "after" as const, from: 0, to: 1 };
const owner = { documentId: "document1", taskId: "task1" };
function useTestGeneration(onSelectedDraft: () => void) {
  return useGeneration({
    model: {
      state: { document: { id: "document1" } },
      status: { dirty: false },
      autosave: { document: { versionId: "head1" } },
    },
    taskId: "task1",
    onSelectedDraft,
  } as never);
}

it("reselects the latest head without losing instruction or direct edits", () => {
  selected().begin(candidateProjection(), range);
  const draft = selected().draft;
  draft.set({
    ...draft.value,
    instruction: "더 쉽게",
    replacement: "쉬운 표현",
    prepared: { kind: "regenerate", value: {} } as never,
  });
  selected().begin(candidateProjection("head2"), range);
  expect(selected().draft.value).toMatchObject({
    instruction: "더 쉽게",
    replacement: "쉬운 표현",
    prepared: null,
    target: { expectedHeadId: "head2" },
  });
});

it("keeps source and review active targets independent while preserving both instructions", () => {
  const candidate = selectedRequestTarget(candidateProjection(), range);
  const confirmed = { ...candidate, kind: "confirmed" as const };
  const source = () => useSelectedRequest("document1", "task1", "source");
  source().adopt(confirmed);
  source().draft.set({ ...source().draft.value, instruction: "원문 초안" });
  selected().adopt(candidate);
  selected().draft.set({ ...selected().draft.value, instruction: "후보 초안" });
  expect(source().draft.value).toMatchObject({
    target: confirmed,
    instruction: "원문 초안",
  });
  expect(selected().draft.value).toMatchObject({
    target: candidate,
    instruction: "후보 초안",
  });
});

it("opens failed selection A after B became active, preserving B", () => {
  const first = selectedRequestTarget(candidateProjection(), range);
  if (first.kind !== "candidate") throw new Error("후보 선택이어야 합니다.");
  selected().adopt(first);
  const firstDraft = selected().draft;
  firstDraft.set({ ...firstDraft.value, instruction: "A 요청" });
  selected().adopt({ ...first, proposalId: "proposal2" });
  const secondDraft = selected().draft;
  secondDraft.set({ ...secondDraft.value, instruction: "B 요청" });
  let opened = "";
  useTestGeneration(() => {
    opened = selected().draft.value.instruction;
  }).edit({
    status: "FAILED",
    request: failedRequest(first),
  } as GenerationAttempt);
  expect(opened).toBe("A 요청");
  expect(secondDraft.value.target).toMatchObject({ proposalId: "proposal2" });
  expect(
    context.store.peek(
      selectionTargetKey({ ...first, proposalId: "proposal2" }),
    ),
  ).toMatchObject({ instruction: "B 요청" });
});

it.each(["confirmed", "rewrite"] as const)(
  "opens the matching %s draft",
  (kind) => {
    const target = {
      ...selectedRequestTarget(candidateProjection(), range),
      batchId: "batch1",
      kind,
    } as SelectedTarget;
    selected().adopt(target);
    context.store.write('["comment","document1","task1"]', {
      target: { quote: "참고" },
    });
    expect(
      openFailedSelectionDraft(context.store, failedRequest(target), owner),
    ).toBe(true);
    expect(selected().draft.value.target).toEqual(target);
  },
);

it.each(["confirmed", "candidate", "rewrite"] as const)(
  "routes a failed %s request to its own surface without moving the other pointer",
  (kind) => {
    const target = {
      ...selectedRequestTarget(candidateProjection(), range),
      kind,
    } as SelectedTarget;
    selected().adopt(target);
    const draft = selected().draft;
    draft.set({ ...draft.value, instruction: "실패한 지시" });
    const opened = vi.fn();
    useTestGeneration(opened).edit({
      status: "FAILED",
      request: failedRequest(target),
    } as GenerationAttempt);
    expect(opened).toHaveBeenCalledWith(
      kind === "confirmed" ? "source" : "review",
    );
    const source = useSelectedRequest("document1", "task1", "source");
    if (kind === "confirmed")
      expect(source.draft.value).toMatchObject({
        target,
        instruction: "실패한 지시",
      });
  },
);

it("keeps the active draft on missing, ambiguous or cross-owner recovery", () => {
  const target = {
    ...selectedRequestTarget(candidateProjection(), range),
    kind: "confirmed" as const,
  };
  selected().adopt(target);
  const index = '["selected-request","document1","task1","active"]';
  const current = context.store.peek(index);
  const missing = { ...target, expectedHeadId: "missing" };
  expect(() =>
    openFailedSelectionDraft(context.store, failedRequest(missing), owner),
  ).toThrow(/특정/);
  const duplicate = { ...target, batchId: "batch2" };
  context.store.write(legacySelectionTargetKey(duplicate), {
    ...selected().draft.value,
    target: duplicate,
  });
  expect(() =>
    openFailedSelectionDraft(context.store, failedRequest(target), owner),
  ).toThrow(/특정/);
  expect(() =>
    openFailedSelectionDraft(context.store, failedRequest(target), {
      ...owner,
      taskId: "other-task",
    }),
  ).toThrow(/문서와 작업/);
  expect(() =>
    openFailedSelectionDraft(context.store, failedRequest(target), {
      ...owner,
      documentId: "other-document",
    }),
  ).toThrow(/문서와 작업/);
  expect(context.store.peek(index)).toBe(current);
});

it("keeps ordinary failed-request editing in the ordinary request form", () => {
  const openSelection = vi.fn();
  useTestGeneration(openSelection).edit({
    jobId: "job",
    attemptId: "attempt",
    status: "FAILED",
    errorCode: null,
    request: {
      kind: "generate",
      value: {
        documentId: "document1",
        taskId: "task1",
        expectedHeadId: "head1",
        operationId: "operation1",
        instruction: "일반 요청 지시",
        retryOf: null,
        model: { provider: "codex", model: "fixture", effort: "low" },
        mode: "PATCH",
        selection: { kind: "whole" },
        expectedActiveBatchId: null,
        archivePrevious: false,
      },
    },
  });
  expect(openSelection).not.toHaveBeenCalled();
  expect(context.store.peek('["request","document1","task1"]')).toMatchObject({
    instruction: "일반 요청 지시",
    pending: null,
  });
});

it("rejects an oversized source scope before replacing a valid pinned scope", () => {
  useRequestScope(0, "document1", "task1").capture(
    captureSourceSelection("정상", { from: 0, to: 2, cursor: 2 }),
  );
  const source = "\\".repeat(800 * 1024);
  const captured = captureSourceSelection(source, {
    from: 0,
    to: source.length,
    cursor: source.length,
  });
  expect(() =>
    useRequestScope(0, "document1", "task1").capture(captured),
  ).toThrow(/크기|범위/);
  expect(useRequestScope(0, "document1", "task1").value("정상")).toEqual({
    kind: "selection",
    from: 0,
    to: 2,
  });
});
