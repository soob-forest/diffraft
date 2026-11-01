import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { settings } from "./support/codex-state.mjs";
import { conversation } from "./support/generation-fixture.mjs";
import { invoke, root } from "./support/review-fixture.mjs";

describe("Codex 재시작 복원", () => {
  it("공급자·모델·대화·확정본을 복원한다", async () => {
    const expected = JSON.parse(
      await readFile(join(root, "codex-expected.json"), "utf8"),
    );
    assert.notEqual(await invoke("e2e_process_id", {}), expected.pid);
    assert.deepEqual(await settings({ kind: "read" }), expected.preferences);
    assert.deepEqual(
      (await conversation(expected.task)).messages,
      expected.messages,
    );
    assert.equal(
      await readFile(expected.document.path, "utf8"),
      expected.confirmed,
    );
    await $("button=AI 연결 설정").click();
    await $("#codex-model").waitForEnabled();
    assert.equal(
      await $("#codex-model").getValue(),
      expected.preferences.codexModel?.model ?? "",
    );
    await $("button=설정 닫기").click();
  });
});
