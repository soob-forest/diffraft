import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { invoke, prepare, root } from "./support/review-fixture.mjs";
import {
  chooseGroup,
  openComment,
  openRegenerate,
} from "./support/review-ui.mjs";

describe("SC07 독립 재개 분기 준비", () => {
  it("D02 거절·D01 승인 후 D03 r2를 v13의 미승인으로 남긴다", async () => {
    const fixture = await prepare("review");
    await chooseGroup(2);
    await $("button=선택한 변경 거절").click();
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="diff-stats"]').getText()) === "+2 / −2",
    );
    await chooseGroup(1);
    await $("button=선택한 변경 승인").click();
    await browser.waitUntil(
      async () => (await $(".version-badge").getText()) === "v13",
    );
    await openComment();
    await $(".comment-form textarea").setValue(
      "실행 주체를 명확하게 해 주세요.",
    );
    await $("button=코멘트 저장").click();
    await browser.waitUntil(async () =>
      (await $(".comment-list").getText()).includes("실행 주체"),
    );
    await openRegenerate();
    await $(".regenerate-form textarea").setValue(
      "코멘트를 반영해 실행 주체를 명시해 주세요.",
    );
    await writeFile(join(root, "next-generation"), "REGENERATE");
    await $("button=재제안 요청").click();
    await $("button=확인 후 재제안").waitForDisplayed();
    await $("button=확인 후 재제안").click();
    await browser.waitUntil(async () =>
      (await $(".candidate-form summary").getProperty("textContent")).includes(
        "r2",
      ),
    );
    assert.equal(await $(".version-badge").getText(), "v13");
    await writeFile(
      join(root, "design-resume.json"),
      JSON.stringify({
        documentId: fixture.document.id,
        processId: await invoke("e2e_process_id", {}),
      }),
    );
  });
});
