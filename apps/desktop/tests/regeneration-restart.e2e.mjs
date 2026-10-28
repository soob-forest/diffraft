import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, examples, invoke, root } from "./support/review-fixture.mjs";

describe("재제안 이후 앱 재시작", () => {
  it("미승인 r2와 원래 삭제 쪽 코멘트·확정본을 복원한다", async () => {
    const expected = JSON.parse(
      await readFile(join(root, "regeneration-expected.json"), "utf8"),
    );
    assert.notEqual(await invoke("e2e_process_id"), expected.processId);
    await $(".sidebar").$("button=regeneration").click();
    await $("button=변경 검토").click();
    await $("button=3번 변경").waitForDisplayed();
    await $("button=3번 변경").click();
    assert.match(await $(".candidate-form summary").getText(), /r2/);
    const state = await editor({
      kind: "read",
      documentId: expected.documentId,
    });
    assert.equal(state.document.version, 12);
    assert.equal(
      state.document.content,
      await readFile(new URL("base_v12.md", examples), "utf8"),
    );
    assert.match(await $(".comment-list").getText(), /실행 주체/);
    await $(".candidate-form summary").click();
    assert.match(
      await $(".candidate-form textarea").getValue(),
      /여행자는 준비물과 다음 여행 계획/,
    );
  });
});
