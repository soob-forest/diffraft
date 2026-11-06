import { expect, it } from "vitest";
import { DraftStore } from "../src/drafts/store";
import type { ChangeQuestion } from "../src/generated/ChangeQuestion";
import { switchRequestMode } from "../src/generation/request-draft";
import {
  chooseRequestTarget,
  requestKey,
} from "../src/generation/request-targets";

const question: ChangeQuestion = {
  documentId: "doc",
  taskId: "task",
  batchId: "batch",
  baseVersionId: "head",
  subject: { kind: "unit", id: "unit", revision: 2 },
  label: "변경 2",
  changes: [{ id: "change", before: "전", after: "후" }],
  contentHash: "hash",
};
it("preserves instructions and pinned changes separately from source and reference drafts", () => {
  const store = new DraftStore(),
    key = requestKey("doc", "task");
  store.write(key, { mode: "PATCH", instruction: "원문 지시" });
  chooseRequestTarget(store, key, { question }, "EXPLAIN");
  store.write(key, { mode: "EXPLAIN", question, instruction: "질문 지시" });
  const source = chooseRequestTarget(
    store,
    key,
    { question: undefined },
    "PATCH",
  );
  expect(source.instruction).toBe("원문 지시");
  expect(source.question).toBeUndefined();
  const restored = chooseRequestTarget(store, key, { question }, "EXPLAIN");
  expect(restored.question).toEqual(question);
  expect(restored.instruction).toBe("질문 지시");
});
it("refuses to replace a quarantined request", () => {
  const store = new DraftStore(),
    key = requestKey("doc", "task");
  store.block(key);
  expect(() =>
    chooseRequestTarget(store, key, { question }, "EXPLAIN"),
  ).toThrow(/잠겼/);
  expect([...store.entries()]).toEqual([]);
});
it("restores the requested mode at entry points without overwriting another mode on a round trip", () => {
  const store = new DraftStore(),
    key = requestKey("doc", "task");
  store.write(key, {
    mode: "PATCH",
    instruction: "부분 지시",
    instructions: { REWRITE: "전체 지시", EXPLAIN: "질문 지시" },
  });
  const rewrite = chooseRequestTarget(store, key, {}, "REWRITE");
  expect(rewrite.instruction).toBe("전체 지시");
  store.write(key, switchRequestMode(rewrite, "EXPLAIN"));
  chooseRequestTarget(store, key, { referenceBatchId: "reference" }, "REWRITE");
  expect(chooseRequestTarget(store, key, {}, "PATCH").instruction).toBe(
    "부분 지시",
  );
  expect(chooseRequestTarget(store, key, {}, "EXPLAIN").instruction).toBe(
    "질문 지시",
  );
  expect(chooseRequestTarget(store, key, {}, "REWRITE").instruction).toBe(
    "전체 지시",
  );
});
it("does not carry a legacy single-mode instruction into a different mode", () => {
  const store = new DraftStore(),
    key = requestKey("doc", "task");
  store.write(key, { mode: "EXPLAIN", instruction: "質問 😀" });
  expect(chooseRequestTarget(store, key, {}, "PATCH").instruction).toBe("");
  expect(chooseRequestTarget(store, key, {}, "EXPLAIN").instruction).toBe(
    "質問 😀",
  );
});
it("retains current input when the destination draft is quarantined", () => {
  const store = new DraftStore(),
    key = requestKey("doc", "task");
  const current = { mode: "PATCH", instruction: "현재 지시" };
  store.write(key, current);
  store.block(
    JSON.stringify(["request", "doc", "task", "source", "reference"]),
  );
  expect(() =>
    chooseRequestTarget(
      store,
      key,
      { referenceBatchId: "reference" },
      "REWRITE",
    ),
  ).toThrow(/복구/);
  expect(store.peek(key)).toBe(current);
});
it("compares a restored question semantically while rejecting altered text with an unchanged hash", async () => {
  const { sameQuestion } = await import("../src/generation/request-draft");
  const reversed = Object.fromEntries(
    Object.entries(question).reverse(),
  ) as ChangeQuestion;
  expect(sameQuestion(question, reversed)).toBe(true);
  expect(
    sameQuestion(question, {
      ...question,
      changes: [{ id: "change", before: "조작", after: "후" }],
    }),
  ).toBe(false);
});
