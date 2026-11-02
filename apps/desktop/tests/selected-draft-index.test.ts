import { expect, it } from "vitest";
import { decodeDraft } from "../src/drafts/decode";
import { DraftStore } from "../src/drafts/store";
import { saveFirstSourceDraft } from "../src/editor/source-request-store";
import {
  selectionIndexKey,
  selectionIndexSeed,
} from "../src/review/selected-draft-index";
import {
  type SelectedTarget,
  selectionTargetKey,
} from "../src/review/selection-targets";
import { EMPTY_SELECTED } from "../src/review/useSelectedRequest";

const target: SelectedTarget = {
  kind: "confirmed",
  documentId: "doc",
  expectedHeadId: "head",
  candidate: "원문",
  title: "원문",
  selection: { taskId: "task", fromUtf16: 0, toUtf16: 2, quote: "원문" },
};
function oldStore() {
  const store = new DraftStore(),
    key = selectionTargetKey(target);
  const index = { instruction: "", key };
  store.hydrate(key, {
    ...EMPTY_SELECTED,
    target,
    instruction: "과거 원문 지시",
  });
  store.hydrate(selectionIndexKey("doc", "task"), index);
  return { store, index, key };
}

it("seeds a separate source pointer from a legacy confirmed pointer without rewriting either draft", () => {
  const { store, index, key } = oldStore();
  const seed = selectionIndexSeed(store, "doc", "task", "source");
  expect(seed).toMatchObject({
    key: selectionIndexKey("doc", "task", "source"),
    migrate: true,
    initial: index,
  });
  store.read(seed.key, seed.initial);
  store.replace(seed.key, seed.initial, seed.initial);
  store.write(selectionIndexKey("doc", "task"), {
    instruction: "",
    key: "review-target",
  });
  expect(store.peek(seed.key)).toBe(index);
  expect(store.peek(key)).toMatchObject({ instruction: "과거 원문 지시" });
});
it("never overwrites an explicit source pointer, a late source edit, or blocked legacy data", () => {
  const { store } = oldStore(),
    source = selectionIndexKey("doc", "task", "source");
  const seed = selectionIndexSeed(store, "doc", "task", "source");
  store.read(source, seed.initial);
  const empty = { instruction: "", key: "" };
  store.write(source, empty);
  store.replace(source, seed.initial, seed.initial);
  expect(store.peek(source)).toBe(empty);
  expect(selectionIndexSeed(store, "doc", "task", "source").migrate).toBe(
    false,
  );
  const previous = oldStore();
  previous.store.block(selectionIndexKey("doc", "task"));
  expect(
    selectionIndexSeed(previous.store, "doc", "task", "source").initial.key,
  ).toBe("");
});
it("stores a first source instruction without moving the review pointer", () => {
  const { store, index } = oldStore();
  saveFirstSourceDraft(store, target, "첫 원문 지시");
  expect(store.peek(selectionIndexKey("doc", "task"))).toBe(index);
  expect(store.peek(selectionIndexKey("doc", "task", "source"))).toMatchObject({
    key: selectionTargetKey(target),
  });
});
it("rejects a source pointer aimed at a candidate rather than a confirmed selection", () => {
  expect(() =>
    decodeDraft({
      key: selectionIndexKey("doc", "task", "source"),
      schemaVersion: 1,
      revision: 1,
      updatedAt: 1,
      valueJson: JSON.stringify({
        instruction: "",
        key: '["selected-request","doc","task","batch","proposal","1","0:2"]',
      }),
    }),
  ).toThrow(/형식/);
});
