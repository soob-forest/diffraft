import assert from "node:assert/strict";
import { conversation, review } from "./generation-fixture.mjs";
import { editor, invoke } from "./review-fixture.mjs";
import { openComment, showSummary } from "./review-ui.mjs";
import { assertSource, captureScene, openFixture } from "./tobe-fixture.mjs";
import { assertCommentFlow } from "./tobe-layout.mjs";

export async function checkLongComment() {
  const fixture = await prepareLongTable();
  await captureScene("review-long-table");
  await openComment();
  assert.equal(await $("button=코멘트 저장").isEnabled(), false);
  await assertCommentFlow();
  const quote = await $(".comment-form .quote-text").getProperty("textContent");
  assert.ok(quote.split("\n").length > 40);
  const height = await $(".comment-form .quote-text").getSize("height");
  assert.ok(height <= 109, `인용 미리보기는 최대4줄이어야 합니다: ${height}`);
  const visibleChange = await browser.execute(() => {
    const span = document.querySelector(".comment-form .quote-text");
    const index = span.textContent.indexOf("새 명령");
    const range = document.createRange();
    range.setStart(span.firstChild, index);
    range.setEnd(span.firstChild, index + 4);
    const quote = span.getBoundingClientRect(),
      change = range.getBoundingClientRect();
    return change.top >= quote.top - 1 && change.bottom <= quote.bottom + 1;
  });
  assert.equal(
    visibleChange,
    true,
    "긴 표의 미리보기는 실제 변경 위치를 보여야 합니다",
  );
  await $(".comment-form").$("button=인용 전문 보기").click();
  assert.equal(
    await $(".comment-form .quote-text").getProperty("textContent"),
    quote,
  );
  await $(".comment-form").$("button=인용 접기").click();
  await $(".comment-form textarea").setValue(
    "전체 표의 수치를 그대로 유지해 주세요.",
  );
  await showSummary();
  await browser.waitUntil(async () =>
    browser.execute(() => document.activeElement?.matches(".comment-entry")),
  );
  await openComment();
  assert.equal(
    await $(".comment-form textarea").getValue(),
    "전체 표의 수치를 그대로 유지해 주세요.",
  );
  await captureScene("comment-long-table");
  const before = await conversation(fixture.task.id);
  await $("button=코멘트 저장").click();
  await browser.waitUntil(
    async () => (await review(fixture.task.id)).comments.length === 1,
  );
  assert.equal((await review(fixture.task.id)).comments[0].anchor.quote, quote);
  assert.deepEqual(await conversation(fixture.task.id), before);
  await assertSource(fixture, "layout");
}

async function prepareLongTable() {
  const source = [
    "# 긴 표",
    "",
    "| 명령 | 수치 |",
    "| --- | --- |",
    ...Array.from({ length: 40 }, (_, i) => `| 명령 ${i} 😀 | ${i} |`),
    "",
  ].join("\n");
  const fixture = await openFixture("layout", source, 2);
  const scope = await editor({
    kind: "scope",
    documentId: fixture.document.id,
    expectedVersion: 2,
    selection: { kind: "whole" },
  });
  const block = scope.blocks.find((value) => value.text.startsWith("| 명령 |"));
  const before = block.text.trimEnd();
  await invoke("e2e_register_ai", {
    documentId: fixture.document.id,
    taskId: fixture.task.id,
    responseJson: JSON.stringify({
      schema_version: 1,
      mode: "PATCH",
      summary: "긴 표 합성 회귀",
      changes: [
        {
          block_id: block.id,
          before,
          after: `${before}\n| 새 명령 | 40 |`,
          reason: "표 끝에 새 항목",
        },
      ],
    }),
  });
  await $("button=변경 검토").click();
  await $('[data-testid="diff-inline"]').waitForDisplayed();
  return fixture;
}
