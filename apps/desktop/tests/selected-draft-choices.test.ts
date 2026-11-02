import { expect, it } from "vitest";
import { DraftStore } from "../src/drafts/store";
import { selectedDraftChoices } from "../src/review/selected-draft-choices";
import {
  legacySelectionTargetKey,
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
it("reuses a unique legacy confirmed draft without moving or rewriting its record", () => {
  const store = new DraftStore(),
    legacy = { ...target, batchId: "old-batch" },
    key = legacySelectionTargetKey(legacy);
  const value = {
    ...EMPTY_SELECTED,
    target: legacy,
    instruction: "보존할 지시",
  };
  store.hydrate(key, value);
  expect(selectedDraftChoices(store, target)).toEqual([{ key, value }]);
  expect(store.peek(selectionTargetKey(target))).toBeUndefined();
  expect(store.peek(key)).toBe(value);
});
it("keeps conflicting legacy and canonical instructions available for explicit choice", () => {
  const store = new DraftStore(),
    legacy = { ...target, batchId: "old-batch" };
  store.hydrate(legacySelectionTargetKey(legacy), {
    ...EMPTY_SELECTED,
    target: legacy,
    instruction: "과거 지시",
  });
  store.hydrate(selectionTargetKey(target), {
    ...EMPTY_SELECTED,
    target,
    instruction: "새 지시",
  });
  const choices = selectedDraftChoices(store, target);
  expect(choices.map((value) => value.value.instruction)).toEqual([
    "과거 지시",
    "새 지시",
  ]);
  expect(
    selectedDraftChoices(store, { ...target, expectedHeadId: "other" }),
  ).toEqual([]);
});
