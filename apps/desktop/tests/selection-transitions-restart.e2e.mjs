import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, root } from "./support/review-fixture.mjs";

describe("화면별 선택 초안 재실행", () => {
  it("원문·후보의 활성 대상을 각각 복원하고 원문을 바꾸지 않는다", async () => {
    const expected = JSON.parse(
      await readFile(join(root, "transition-expected.json"), "utf8"),
    );
    await $(".source-draft-resume").waitForDisplayed();
    await $(".source-draft-resume").click();
    await $(".source-selection-panel textarea").waitForDisplayed();
    assert.equal(
      await $(".source-selection-panel textarea").getValue(),
      expected.sourceInstruction,
    );
    assert.match(await $(".source-selection-panel").getText(), /원문 · v12/);
    await $(".source-selection-panel button[type=submit]").waitForEnabled();
    await $("button=변경 검토").click();
    const form = $(".review-detail .selected-request-form");
    await $(".review-detail").$("button=선택 수정 초안 이어쓰기").click();
    await form.$("textarea").waitForDisplayed();
    assert.equal(
      await form.$("textarea").getValue(),
      expected.reviewInstruction,
    );
    assert.match(await form.getText(), /제안 내용 · r1/);
    assert.equal(await $(".selection-confirmation").isExisting(), false);
    const state = await editor({
      kind: "read",
      documentId: expected.fixture.document.id,
    });
    assert.equal(state.document.content, expected.fixture.base);
  });
});
