import { expect, it } from "vitest";
import { decodeDraft } from "../src/drafts/decode";
import { captureSourceSelection } from "../src/editor/source-selection";
import { confirmedSourceTarget } from "../src/editor/source-target";
import { selectionTargetKey } from "../src/review/selection-targets";

const document = {
  id: "doc",
  versionId: "head",
  version: 2,
  content: "같은 문장과 같은 문장",
};
it("identifies a source selection without a proposal batch and preserves exact coordinates", () => {
  const captured = captureSourceSelection(document.content, {
    from: 7,
    to: 12,
    cursor: 12,
  });
  const target = confirmedSourceTarget(document as never, "task", captured);
  expect(target).toMatchObject({
    kind: "confirmed",
    expectedHeadId: "head",
    selection: {
      fromUtf16: 7,
      toUtf16: 12,
      quote: document.content.slice(7, 12),
    },
  });
  expect(target).not.toHaveProperty("batchId");
  expect(selectionTargetKey(target)).toBe(
    selectionTargetKey({ ...target, batchId: "legacy-batch" }),
  );
  expect(() =>
    confirmedSourceTarget(
      { ...document, content: "変わった" } as never,
      "task",
      captured,
    ),
  ).toThrow(/원문/);
});
it("decodes a batch-free confirmed target and its active index", () => {
  const target = {
    kind: "confirmed" as const,
    documentId: "doc",
    expectedHeadId: "head",
    candidate: "원문",
    title: "원문",
    sourceVersion: 2,
    selection: { taskId: "task", fromUtf16: 0, toUtf16: 2, quote: "원문" },
  };
  const key = selectionTargetKey(target);
  const record = {
    key,
    schemaVersion: 1,
    revision: 1,
    updatedAt: 1,
    valueJson: JSON.stringify({
      instruction: "쉽게",
      target,
      prepared: null,
      commentIds: null,
    }),
  };
  expect(decodeDraft(record)).toMatchObject({ target, instruction: "쉽게" });
  expect(
    decodeDraft({
      ...record,
      key: '["selected-request","doc","task","active"]',
      valueJson: JSON.stringify({ instruction: "", key }),
    }),
  ).toMatchObject({ key });
});
