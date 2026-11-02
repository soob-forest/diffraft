import { expect, it } from "vitest";
import { decodeDraft } from "../src/drafts/decode";

const record = (kind: string, value: unknown) => ({
  key: JSON.stringify([kind, "doc", "task"]),
  schemaVersion: 1,
  revision: 1,
  updatedAt: 1,
  valueJson: JSON.stringify(value),
});
it("rejects malformed pinned scopes and selected targets before hydration", () => {
  expect(() =>
    decodeDraft(
      record("source-scope", {
        kind: "selection",
        captured: { epoch: 0, value: { quote: "x" } },
      }),
    ),
  ).toThrow();
  expect(() =>
    decodeDraft(
      record("selected-request", {
        instruction: "keep",
        target: { kind: "candidate" },
        prepared: null,
        commentIds: null,
      }),
    ),
  ).toThrow();
});
it("restores valid scope snapshots without changing their exact quote", () => {
  const value = {
    kind: "selection",
    captured: {
      epoch: 0,
      value: {
        selection: { from: 0, to: 2, cursor: 2 },
        quote: "안녕",
        source: "안녕",
      },
    },
  };
  expect(decodeDraft(record("source-scope", value))).toEqual(value);
});

it("restores a confirmed request with its pinned scope and model without changing modes", () => {
  const pending = {
    kind: "generate",
    request: {
      documentId: "doc",
      expectedHeadId: "head",
      operationId: "operation",
      instruction: "고정 지시",
      model: { provider: "codex", model: "saved-model", effort: "low" },
    },
    scope: { text: "정확한 인용", version: 12 },
  };
  const value = { mode: "PATCH", instruction: "고정 지시", pending };
  expect(decodeDraft(record("request", value))).toEqual(value);
  expect(() =>
    decodeDraft(
      record("request", { ...value, pending: { ...pending, scope: null } }),
    ),
  ).toThrow();
});
