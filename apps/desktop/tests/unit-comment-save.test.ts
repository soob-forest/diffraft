import { expect, it, vi } from "vitest";
import { DraftStore } from "../src/drafts/store";
import {
  saveUnitComment,
  storeUnitCommentDraft,
  type UnitCommentDraft,
} from "../src/review/unit-comment-save";

const key = "comment",
  other = "other-unit";
const initial: UnitCommentDraft = {
  version: 1,
  id: "same-id",
  text: "opinion",
};
function fixture(flush = vi.fn(async () => {})) {
  const store = new DraftStore();
  store.write(key, initial);
  store.write(other, { ...initial, id: "other" });
  const draft = {
    value: initial,
    flush,
    replace: (expected: UnitCommentDraft, next: UnitCommentDraft) =>
      store.replace(key, expected, next),
  };
  return {
    store,
    draft,
    register: vi.fn(async (_draft: UnitCommentDraft) => {}),
    onStage: vi.fn(),
  };
}

it("does not register when draft storage fails and reports the failed stage", async () => {
  const test = fixture(
    vi.fn(async () => {
      throw new Error("storage failed");
    }),
  );
  const result = await saveUnitComment(test);
  expect(result).toMatchObject({
    kind: "failed",
    stage: "draft",
    submitted: initial,
  });
  expect(test.register).not.toHaveBeenCalled();
  expect(test.store.peek(key)).toBe(initial);
});

it("retries a failed registration with the same ID and clears only its submitted input", async () => {
  const test = fixture();
  test.register.mockRejectedValueOnce(new Error("reply lost"));
  expect(await saveUnitComment(test)).toMatchObject({
    kind: "failed",
    stage: "registration",
  });
  expect(test.store.peek(key)).toBe(initial);
  expect(await saveUnitComment(test)).toMatchObject({ kind: "registered" });
  expect(test.register.mock.calls.map(([draft]) => draft.id)).toEqual([
    "same-id",
    "same-id",
  ]);
  expect(test.store.peek(key)).toMatchObject({ text: "" });
  expect(test.store.peek(other)).toMatchObject({
    id: "other",
    text: "opinion",
  });
});

it("a late registration cannot clear newer input after a unit switch and return", async () => {
  const test = fixture();
  let finish: () => void = () => {};
  test.register.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const saving = saveUnitComment(test);
  await Promise.resolve();
  const newer = { ...initial, id: "new-id", text: "new opinion" };
  test.store.write(key, newer);
  finish();
  expect(await saving).toMatchObject({
    kind: "registered",
    submitted: initial,
  });
  expect(test.store.peek(key)).toBe(newer);
  expect(test.store.peek(other)).toMatchObject({ id: "other" });
});

it("validates before storage or registration and never promises unconfirmed preservation", async () => {
  const test = fixture();
  test.draft.value = { ...initial, text: "한".repeat(6000) };
  const result = await saveUnitComment(test);
  expect(result).toMatchObject({ kind: "failed", stage: "input" });
  expect(result.message).not.toContain("그대로 보관");
  expect(test.draft.flush).not.toHaveBeenCalled();
  expect(test.register).not.toHaveBeenCalled();
});

it("draft recovery retries storage without registering or clearing the opinion", async () => {
  const test = fixture();
  expect(await storeUnitCommentDraft(test.draft)).toBeNull();
  expect(test.draft.flush).toHaveBeenCalledTimes(1);
  expect(test.register).not.toHaveBeenCalled();
  expect(test.store.peek(key)).toBe(initial);
});
