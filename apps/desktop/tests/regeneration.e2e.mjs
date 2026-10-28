import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { editor, invoke, prepare, root } from "./support/review-fixture.mjs";

const instruction = "코멘트를 반영하고 여행자의 준비 내용를 명시해 주세요.";
let fixture;
async function reviewState(taskId) {
  return (
    await invoke("review_command", {
      request: { schemaVersion: 1, action: { kind: "state", taskId } },
    })
  ).value;
}
async function start(mode) {
  await writeFile(join(root, "next-generation"), mode);
  await $("button=재제안 요청").click();
}
describe("코멘트를 반영한 재제안", () => {
  it("삭제 쪽 선택과 코멘트 대상이 보기 전환 뒤에도 유지된다", async () => {
    fixture = await prepare("regeneration");
    await $("button=3번 변경").click();
    await browser.execute(() =>
      document.querySelector('[data-testid="diff-inline"]').focus(),
    );
    await browser.keys(Key.ArrowLeft);
    await browser.keys([Key.Shift, Key.ArrowRight, Key.ArrowRight]);
    await $(".comment-form summary").click();
    await browser.execute(() => {
      const select = document.querySelector(".comment-form select");
      select.value = "before";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await browser.waitUntil(
      async () => (await $(".comment-form blockquote").getText()) === "필요",
    );
    await $("button=나란히").click();
    assert.equal(await $(".comment-form blockquote").getText(), "필요");
    await $("button=인라인").click();
    assert.equal(await $(".comment-form blockquote").getText(), "필요");
    await $(".comment-form textarea").setValue(
      "실행 주체를 명확하게 해 주세요.",
    );
    await $("button=코멘트 저장").click();
    await browser.waitUntil(async () =>
      (await $(".comment-list").getText()).includes("실행 주체"),
    );
    const state = await reviewState(fixture.task.id);
    assert.equal(state.comments[0].anchor.side, "before");
    assert.equal(state.comments[0].anchor.quote, "필요");
  });
  it("형식 오류가 나도 이전 후보와 코멘트·입력 지시를 유지한다", async () => {
    await $(".regenerate-form summary").click();
    await $(".regenerate-form textarea").setValue(instruction);
    await start("malformed");
    await browser.waitUntil(async () =>
      (await $(".regenerate-form [role=status]").getText()).includes(
        "응답 형식",
      ),
    );
    assert.match(await $(".candidate-form summary").getText(), /r1/);
    assert.equal(await $(".regenerate-form textarea").getValue(), instruction);
    const state = await reviewState(fixture.task.id);
    assert.equal(state.generating, false);
    assert.equal(state.comments[0].revision, 1);
    assert.equal(
      await readFile(join(root, "regeneration.md"), "utf8"),
      fixture.base,
    );
  });
  it("생성 중 승인을 막고 성공한 r2만 미승인 후보로 보존한다", async () => {
    await browser.waitUntil(
      async () => await $("button=재제안 요청").isEnabled(),
    );
    await start("REGENERATE_DELAY");
    assert.equal(await $("button=선택한 변경 승인").isEnabled(), false);
    assert.equal(await $("button=남은 제안 전체 승인").isEnabled(), false);
    await browser.waitUntil(
      async () => (await reviewState(fixture.task.id)).generating,
    );
    await $("button=나란히").click();
    await browser.waitUntil(async () =>
      (await $(".candidate-form summary").getText()).includes("r2"),
    );
    const state = await reviewState(fixture.task.id);
    assert.equal(state.comments[0].anchor.side, "before");
    assert.equal(state.comments[0].anchor.quote, "필요");
    assert.equal(state.comments[0].status, "OPEN");
    assert.equal(
      await readFile(join(root, "regeneration.md"), "utf8"),
      fixture.base,
    );
    assert.equal(await $(".version-badge").getText(), "v12");
    await writeFile(
      join(root, "regeneration-expected.json"),
      JSON.stringify({
        documentId: fixture.document.id,
        taskId: fixture.task.id,
        batchId: fixture.batch.id,
        processId: await invoke("e2e_process_id"),
      }),
    );
    await browser.saveScreenshot(".artifacts/regeneration-r2.png");
  });
  it("생성 중 원문을 수정하면 늦은 후보가 덮어쓰지 않는다", async () => {
    const late = await prepare("regeneration-late");
    await $("button=3번 변경").click();
    await $(".regenerate-form summary").click();
    await $(".regenerate-form textarea").setValue(instruction);
    await start("REGENERATE_DELAY");
    await $("button=원문").click();
    await $('[data-testid="source-editor"]').click();
    await browser.keys([Key.Command, "a"]);
    await browser.keys("직접 수정한 확정본");
    await browser.waitUntil(
      async () => (await $(".version-badge").getText()) === "v13",
    );
    await browser.waitUntil(
      async () => !(await reviewState(late.task.id)).generating,
    );
    const current = await editor({
      kind: "read",
      documentId: late.document.id,
    });
    assert.equal(current.document.content, "직접 수정한 확정본");
    const proposal = (
      await invoke("review_command", {
        request: {
          schemaVersion: 1,
          action: {
            kind: "proposal_at",
            batchId: late.batch.id,
            proposalId: late.batch.proposals[2].id,
            revision: 1,
          },
        },
      })
    ).value;
    assert.equal(proposal.validity, "STALE");
    assert.equal(proposal.decision, "PENDING");
    await $(".sidebar").$("button=regeneration").click();
  });
});
