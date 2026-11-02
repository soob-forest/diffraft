import { expect, it } from "vitest";

const fixture = new URL("./fixtures/fake-codex-response.mjs", import.meta.url);
const { response } = await import(fixture.href);

it.each(["unapproved_candidate", "rewrite_candidate", "confirmed_selection"])(
  "returns the exact selected quote for %s",
  (editableSource) => {
    const result = response({
      mode: "PATCH",
      editableSource,
      target: {
        operation: { blockId: "block-a", before: "whole operation" },
      },
      scope: { text: "선택한 문장 😀" },
    });
    expect(result.changes).toEqual([
      {
        block_id: "block-a",
        before: "선택한 문장 😀",
        after: "승인할 합성 Codex 수정",
        reason: "합성 지시 반영",
      },
    ]);
  },
);

it("retains the operation quote for ordinary regeneration", () => {
  const result = response({
    mode: "PATCH",
    target: { operation: { blockId: "block-b", before: "whole operation" } },
    scope: { text: "reference context" },
  });
  expect(result.changes[0].before).toBe("whole operation");
});

it("selects a nonempty block for ordinary patch requests", () => {
  const result = response({
    mode: "PATCH",
    scope: {
      blocks: [
        { block_id: "empty", before: " " },
        { block_id: "block-c", before: "원문" },
      ],
    },
  });
  expect(result.changes[0]).toMatchObject({
    block_id: "block-c",
    before: "원문",
  });
});

it("keeps explanation and whole-rewrite response shapes", () => {
  expect(response({ mode: "EXPLAIN" })).toEqual({
    schema_version: 1,
    mode: "EXPLAIN",
    answer: "합성 Codex 설명",
  });
  expect(response({ mode: "REWRITE" })).toEqual({
    schema_version: 1,
    mode: "REWRITE",
    summary: "합성 재작성",
    candidate_markdown: "# 합성 Codex 후보\n",
  });
});
