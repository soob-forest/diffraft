import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
export function verifyQuestion(input) {
  if (!existsSync("expected-question.json")) return;
  const expected = JSON.parse(readFileSync("expected-question.json", "utf8"));
  assert.deepEqual(input.questionTarget, expected);
  assert.equal(input.mode, "EXPLAIN");
  assert.equal(input.scope.text, "");
  assert.deepEqual(input.scope.blocks, []);
  writeFileSync("question-observed", "verified");
}
