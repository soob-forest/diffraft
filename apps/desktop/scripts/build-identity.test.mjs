import assert from "node:assert/strict";
import test from "node:test";
import { fingerprintFiles } from "./build-identity.mjs";

test("build identity is deterministic by path and contents, and changes for source edits", () => {
  const entries = [
    { name: "src/b", content: Buffer.from("나") },
    { name: "src/a", content: Buffer.from("가") },
  ];
  const original = fingerprintFiles(entries);
  assert.equal(fingerprintFiles([...entries].reverse()), original);
  assert.notEqual(
    fingerprintFiles([
      { ...entries[0], content: Buffer.from("수정") },
      entries[1],
    ]),
    original,
  );
  assert.notEqual(
    fingerprintFiles([{ ...entries[0], name: "src/c" }, entries[1]]),
    original,
  );
});
