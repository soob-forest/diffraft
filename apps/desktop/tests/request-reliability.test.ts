import { beforeEach, expect, it, vi } from "vitest";
import { DraftStore } from "../src/drafts/store";
import { useRequestScope } from "../src/editor/request-scope";
import { captureSourceSelection } from "../src/editor/source-selection";
import { useRequestDraft } from "../src/generation/useRequestDraft";

const context = vi.hoisted(() => ({ store: null as unknown as DraftStore }));
vi.mock("react", () => ({
  useState: (initial: unknown) => [initial, () => {}],
}));
vi.mock("../src/drafts/SessionDrafts", () => ({
  useSessionDraft: (key: string, initial: unknown) => ({
    value: context.store.read(key, initial),
    locked: context.store.isBlocked(key),
    set: (value: unknown) => context.store.write(key, value),
    update: (transform: (value: unknown) => unknown) =>
      context.store.update(key, initial, transform),
    replace: (expected: unknown, next: unknown) =>
      context.store.replace(key, expected, next),
  }),
}));
const key = '["request","document","task"]';
const request = () => useRequestDraft("document", "task");
beforeEach(() => {
  context.store = new DraftStore();
});

it("restores the failed request kind and retains the other kind's instruction", () => {
  context.store.write(key, { mode: "EXPLAIN", instruction: "설명 초안" });
  request().edit({
    request: { kind: "rewrite", value: { instruction: "전체 재작성" } },
  } as never);
  expect(context.store.peek(key)).toMatchObject({
    mode: "REWRITE",
    instruction: "전체 재작성",
    instructions: { EXPLAIN: "설명 초안" },
  });
});

it("does not resurrect automatic preparation or overwrite input through an old render", () => {
  context.store.write(key, {
    mode: "PATCH",
    instruction: "처음",
    prepareOnOpen: true,
  });
  const stale = request();
  stale.consumePreparation();
  stale.setPending({
    kind: "generate",
    request: { mode: "PATCH", instruction: "처음" },
  } as never);
  expect(request().prepareOnOpen).toBe(false);
  request().setMode("EXPLAIN");
  request().setInstruction("새 설명");
  stale.setPending({
    kind: "generate",
    request: { mode: "PATCH", instruction: "처음" },
  } as never);
  expect(context.store.peek(key)).toMatchObject({
    mode: "EXPLAIN",
    instruction: "새 설명",
    pending: null,
  });
});

it("restores a pinned source after restart but rejects changed source", () => {
  const source = "원문 선택 문장";
  useRequestScope(1, "document", "task").capture(
    captureSourceSelection(source, { from: 3, to: 5, cursor: 5 }),
  );
  const restored = useRequestScope(0, "document", "task");
  expect(restored.selection).toMatchObject({ from: 3, to: 5 });
  expect(restored.value(source)).toEqual({ kind: "selection", from: 3, to: 5 });
  expect(() => restored.value("변경된 원문")).toThrow(/원문/);
});
