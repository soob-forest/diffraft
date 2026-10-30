import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { layoutResponse } from "./layout.mjs";
import { selectedModel } from "./model-arguments.mjs";

const examples = new URL("../../../../docs/examples/", import.meta.url);
const mode = process.argv[2];
const selected = selectedModel(process.argv.slice(3));
let expected;
try {
  expected = await readFile("expected-model", "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (expected !== undefined && expected !== selected) process.exit(2);
if (expected !== undefined)
  await writeFile(
    "model-observation.json",
    JSON.stringify({ model: selected }),
  );
const MAX_INPUT_BYTES = 200 * 1024;
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > MAX_INPUT_BYTES) process.exit(2);
}
if (mode === "malformed") {
  process.stdout.write("{invalid json");
  process.exit(0);
}
const request = JSON.parse(input);
const resumeIndex = process.argv.indexOf("--resume");
let sessionId =
  resumeIndex >= 0
    ? process.argv[resumeIndex + 1]
    : (request.taskId ?? "00000000-0000-4000-8000-000000000001");
if (request.schemaVersion !== 1) process.exit(2);
if (mode === "MODEL_DENIED") {
  process.stdout.write(
    JSON.stringify({
      type: "result",
      subtype: "error_during_execution",
      is_error: true,
      errors: ["API Error: 403 synthetic model policy"],
    }),
  );
  process.exit(1);
}
if (mode === "STRUCTURED_LIMIT") {
  process.stdout.write(
    JSON.stringify({
      type: "result",
      subtype: "error_max_structured_output_retries",
      is_error: true,
      errors: ["synthetic private validation detail"],
    }),
  );
  process.exit(1);
}
if (mode === "SESSION_MISSING") {
  if (resumeIndex < 0) process.exit(2);
  process.stderr.write(`No conversation found with session ID: ${sessionId}\n`);
  process.exit(1);
}
if (mode === "EXPLAIN_FRESH") {
  const hex = createHash("sha256")
    .update(`${request.taskId}:fresh`)
    .digest("hex");
  sessionId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const response = { schema_version: 1, mode };
if (mode === "REGENERATE" || mode === "REGENERATE_DELAY") {
  if (mode === "REGENERATE_DELAY")
    await new Promise((resolve) => setTimeout(resolve, 1800));
  response.mode = "PATCH";
  response.summary = "코멘트를 반영한 후보";
  response.changes = [
    {
      block_id: request.target.operation.blockId,
      before: request.target.operation.before,
      after: "여행자는 준비물과 다음 여행 계획을 여행 기록에 남깁니다.",
      reason: "코멘트의 실행 주체 반영",
    },
  ];
} else if (mode === "PATCH_SCOPE") {
  const block =
    request.scope.blocks.find((value) => value.before.trim()) ??
    request.scope.blocks[0];
  response.mode = "PATCH";
  response.summary = "요청 범위의 문장 개선";
  response.changes = [
    {
      block_id: block.block_id,
      before: block.before,
      after: "검토 후 승인할 새 원문",
      reason: "지시 반영",
    },
  ];
} else if (mode === "PATCH_LAYOUT") {
  Object.assign(response, layoutResponse);
} else if (mode === "PATCH") {
  const fixture = JSON.parse(
    await readFile(new URL("proposals.json", examples), "utf8"),
  );
  response.summary = "여행 준비 명확화";
  response.changes = fixture.changes.map((change) => ({
    block_id: `b${change.line}`,
    before: change.before,
    after: change.after,
    reason: change.name,
  }));
} else if (mode === "REWRITE" || mode === "REWRITE_DELAY") {
  if (mode === "REWRITE_DELAY")
    await new Promise((resolve) => setTimeout(resolve, 1800));
  response.mode = "REWRITE";
  response.summary = "상황별 실행 가이드";
  response.candidate_markdown = await readFile(
    new URL("rewrite_W02.md", examples),
    "utf8",
  );
} else if (
  [
    "EXPLAIN",
    "EXPLAIN_DELAY",
    "EXPLAIN_CONTEXT",
    "EXPLAIN_FRESH",
    "EXPLAIN_CANCEL_RACE",
  ].includes(mode)
) {
  if (mode === "EXPLAIN_DELAY")
    await new Promise((resolve) => setTimeout(resolve, 5000));
  response.mode = "EXPLAIN";
  response.answer =
    mode === "EXPLAIN_CONTEXT"
      ? `${request.goal} / ${request.pinnedRules} / ${request.commonRules}`
      : "확인 시간은 10분입니다.";
} else {
  process.exit(2);
}
const output = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  session_id: sessionId,
  structured_output: response,
});
if (mode === "EXPLAIN_CANCEL_RACE") {
  process.on("SIGTERM", () => {
    process.stdout.write(output, () => process.exit(0));
  });
  await writeFile("generation-ready", request.taskId);
  setInterval(() => {}, 1000);
} else process.stdout.write(output);
