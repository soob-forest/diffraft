const selectedSources = [
  "unapproved_candidate",
  "rewrite_candidate",
  "confirmed_selection",
];

function editableBlock(input) {
  if (!input.target)
    return (
      input.scope.blocks.find((item) => item.before.trim()) ??
      input.scope.blocks[0]
    );
  return {
    block_id: input.target.operation.blockId,
    before: selectedSources.includes(input.editableSource)
      ? input.scope.text
      : input.target.operation.before,
  };
}

export function response(input) {
  if (input.mode === "EXPLAIN")
    return { schema_version: 1, mode: "EXPLAIN", answer: "합성 Codex 설명" };
  if (input.mode === "REWRITE")
    return {
      schema_version: 1,
      mode: "REWRITE",
      summary: "합성 재작성",
      candidate_markdown: "# 합성 Codex 후보\n",
    };
  const block = editableBlock(input);
  return {
    schema_version: 1,
    mode: "PATCH",
    summary: "합성 수정",
    changes: [
      {
        block_id: block.block_id,
        before: block.before,
        after: "승인할 합성 Codex 수정",
        reason: "합성 지시 반영",
      },
    ],
  };
}
