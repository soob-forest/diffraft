import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { holdDatabase } from "./database-lock.mjs";
import { root } from "./review-fixture.mjs";
import { openCandidate, openComment } from "./review-ui.mjs";

const draft = "작성 중인 코멘트";
export async function checkCandidateDraft(fixture) {
  await openCandidate();
  await $(".candidate-form textarea").setValue(
    "준비가 끝나면 동행인에게 알립니다.",
  );
  await $("button=후보 저장").click();
  await browser.waitUntil(async () =>
    (await $(".candidate-form summary").getProperty("textContent")).includes(
      "수정안 2",
    ),
  );
  await openComment();
  assert.equal(await $(".comment-form textarea").getValue(), draft);
  assert.equal(await $("button=코멘트 등록").isEnabled(), false);
  await $(".comment-form [role=alert]").scrollIntoView({ block: "center" });
  await browser.saveScreenshot(".artifacts/usability/anchor-reconfirm.png");
  await $("button=현재 선택으로 대상 재확인").click();
  await checkFailedRegistration();
  await $("button=코멘트 등록").click();
  await browser.waitUntil(
    async () => (await $(".comment-form textarea").getValue()) === "",
  );
  assert.match(
    await $(".comment-form form > p[role=status]").getText(),
    /재제안/,
  );
  await $("button=코멘트 반영 재제안 작성").waitForEnabled();
  await $("button=코멘트 반영 재제안 작성").click();
  await browser.waitUntil(async () =>
    browser.execute(() =>
      document.activeElement?.matches(".regenerate-form textarea"),
    ),
  );
  assert.equal(await readFile(join(root, "review.md"), "utf8"), fixture.base);
}

async function checkFailedRegistration() {
  const release = await holdDatabase();
  try {
    await $("button=코멘트 등록").click();
    await browser.waitUntil(() =>
      browser.execute(() =>
        Boolean(
          document
            .querySelector(".comment-form:not([hidden]) form > p[role=status]")
            ?.textContent.trim(),
        ),
      ),
    );
    assert.equal(await $(".comment-form textarea").getValue(), draft);
  } finally {
    await release();
  }
}
