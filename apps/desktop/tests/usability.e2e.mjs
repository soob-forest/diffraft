import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { holdDatabase } from "./support/database-lock.mjs";
import {
  beginRequest,
  chooseTask,
  conversation,
  createTask,
  terminal,
} from "./support/generation-fixture.mjs";
import { prepare, root } from "./support/review-fixture.mjs";
import {
  openCandidate,
  openComment,
  openScope,
  showSummary,
} from "./support/review-ui.mjs";
import { checkBusyComment } from "./support/usability-busy-comment.mjs";
import { checkResponsiveWorkspace } from "./support/usability-layout.mjs";
import { checkManyChanges } from "./support/usability-many-changes.mjs";

let fixture;
describe("세션 초안과 사용성", () => {
  it("동일 상태의 검토·원문 기준 화면을 기록한다", async () => {
    fixture = await prepare("review");
    await $("button=선택한 변경 승인").waitForEnabled();
    await mkdir(".artifacts/usability", { recursive: true });
    await browser.saveScreenshot(".artifacts/usability/review.png");
    await openComment();
    await $(".comment-form textarea").setValue("작성 중인 코멘트");
    await $(".comment-form textarea").scrollIntoView({ block: "center" });
    await browser.saveScreenshot(".artifacts/usability/comment.png");
    await $("button=원문").click();
    await $("button=검토 이어가기").waitForDisplayed();
    await browser.saveScreenshot(".artifacts/usability/request.png");
  });
  it("요청을 작업과 문서 왕복 뒤에도 보존하고 다른 작업에 섞지 않는다", async () => {
    await $(".request-form textarea").setValue("아직 보내지 않은 요청");
    const second = await createTask("두 번째 작업");
    assert.equal(await $(".request-form textarea").getValue(), "");
    await $(".request-form textarea").setValue("두 번째 초안");
    await chooseTask(fixture.task.id);
    assert.equal(
      await $(".request-form textarea").getValue(),
      "아직 보내지 않은 요청",
    );
    await $("button=새 문서").click();
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "새 문서",
    );
    await $(".sidebar").$("button=review").click();
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "review",
    );
    await $(".request-form textarea").waitForDisplayed();
    assert.equal(
      await $(".request-form textarea").getValue(),
      "아직 보내지 않은 요청",
    );
    await chooseTask(second);
    assert.equal(await $(".request-form textarea").getValue(), "두 번째 초안");
    await chooseTask(fixture.task.id);
  });
  it("코멘트 인용과 입력을 원문·미리보기 왕복 뒤에도 보존한다", async () => {
    await $("button=변경 검토").click();
    await openComment();
    assert.equal(
      await $(".comment-form textarea").getValue(),
      "작성 중인 코멘트",
    );
    const quote = await $(".comment-form blockquote").getText();
    await $("button=미리보기").click();
    await $("button=변경 검토").click();
    await openComment();
    assert.equal(
      await $(".comment-form textarea").getValue(),
      "작성 중인 코멘트",
    );
    assert.equal(await $(".comment-form blockquote").getText(), quote);
  });
  it("후보가 바뀌면 초안 대상을 재확인하고 저장 실패에도 입력을 보존한다", async () => {
    await openCandidate();
    await $(".candidate-form textarea").setValue(
      "준비가 끝나면 동행인에게 알립니다.",
    );
    await $("button=후보 저장").click();
    await browser.waitUntil(async () =>
      (await $(".candidate-form summary").getProperty("textContent")).includes(
        "r2",
      ),
    );
    await openComment();
    assert.equal(
      await $(".comment-form textarea").getValue(),
      "작성 중인 코멘트",
    );
    assert.equal(await $("button=코멘트 저장").isEnabled(), false);
    await $(".comment-form [role=alert]").scrollIntoView({ block: "center" });
    await browser.saveScreenshot(".artifacts/usability/anchor-reconfirm.png");
    await $("button=현재 선택으로 대상 재확인").click();
    const release = await holdDatabase();
    try {
      await $("button=코멘트 저장").click();
      await browser.waitUntil(
        async () =>
          (await $(".comment-form [role=status]").getText()).length > 0,
      );
      assert.equal(
        await $(".comment-form textarea").getValue(),
        "작성 중인 코멘트",
      );
    } finally {
      await release();
    }
    await $("button=코멘트 저장").click();
    await browser.waitUntil(
      async () => (await $(".comment-form textarea").getValue()) === "",
    );
    assert.match(await $(".comment-form [role=status]").getText(), /재제안/);
    await $("button=코멘트 반영 재제안 작성").waitForEnabled();
    await $("button=코멘트 반영 재제안 작성").click();
    await browser.waitUntil(async () =>
      browser.execute(() =>
        document.activeElement?.matches(".regenerate-form textarea"),
      ),
    );
    assert.equal(await readFile(join(root, "review.md"), "utf8"), fixture.base);
  });
  it("조건 저장 실패는 접힌 폼에서도 표시하고 요청과 문서 이동을 차단한다", async () => {
    await $("button=원문").click();
    await $(".task-condition-details > summary").click();
    await $(".task-conditions textarea[required]").setValue("수정한 지속 목표");
    await $(".task-condition-details > summary").click();
    const release = await holdDatabase();
    try {
      await $("button=요청 내용 확인").click();
      await browser.waitUntil(async () =>
        (await $(".task-condition-details > summary").getText()).includes(
          "저장 실패",
        ),
      );
      assert.equal(await $(".generation-dialog").isExisting(), false);
      await browser.saveScreenshot(
        ".artifacts/usability/conditions-save-failed.png",
      );
      await $("button=새 문서").click();
      await $(".workspace-body > .error-banner").waitForDisplayed();
      assert.equal(await $(".document-toolbar h1").getText(), "review");
    } finally {
      await release();
    }
    await $("button=요청 내용 확인").click();
    await $(".generation-dialog").waitForDisplayed();
    await $("button=요청 취소").click();
    await $(".sidebar").$("button=review").click();
    await browser.waitUntil(
      async () => !(await $(".workspace-body > .error-banner").isExisting()),
    );
  });
  it("유효한 검토로 재개하고 패널·창·확대 왕복에서도 초안을 유지한다", async () => {
    await $("button=검토 이어가기").waitForDisplayed();
    await $("button=검토 이어가기").click();
    await $('[data-testid="diff-stats"]').waitForDisplayed();
    await checkResponsiveWorkspace();
  });
  it("빈 선택은 요청하지 않고 이전 실패 지시는 초안 확인 뒤에만 가져온다", async () => {
    await $("button=원문").click();
    await chooseScope("selection");
    assert.equal(await $(".scope-bar select").getValue(), "selection");
    await $("button=요청 내용 확인").click();
    await browser.waitUntil(async () =>
      (await $(".generation-panel").getText()).includes("선택 영역이 없습니다"),
    );
    assert.equal(await $(".generation-dialog").isExisting(), false);
    await chooseScope("whole");
    await beginRequest("EXPLAIN", "malformed", "실패한 요청의 지시");
    const failed = await terminal(fixture.task.id);
    assert.equal(failed.lastAttempt.status, "FAILED");
    await $("button=내용을 수정해 새로 요청").waitForEnabled();
    await $("button=내용을 수정해 새로 요청").scrollIntoView({
      block: "center",
    });
    await browser.saveScreenshot(".artifacts/usability/request-failed.png");
    await $(".request-form textarea").setValue("유지할 새 초안");
    await $("button=내용을 수정해 새로 요청").click();
    await $("button=현재 초안 유지").click();
    assert.equal(
      await $(".request-form textarea").getValue(),
      "유지할 새 초안",
    );
    await $("button=내용을 수정해 새로 요청").click();
    await $("button=이전 지시 가져오기").click();
    assert.equal(
      await $(".request-form textarea").getValue(),
      "실패한 요청의 지시",
    );
    assert.equal(
      (await conversation(fixture.task.id)).lastAttempt.jobId,
      failed.lastAttempt.jobId,
    );
    await $("button=요청 내용 확인").click();
    await $(".generation-dialog").waitForDisplayed();
    assert.equal(
      await $(".request-instruction").getText(),
      "실패한 요청의 지시",
    );
    await $("button=요청 취소").click();
  });
  it("승인 직전 버전을 비교하고 취소하면 승인 결과를 유지한다", async () => {
    await $("button=변경 검토").click();
    await showSummary();
    await $("button=선택한 변경 승인").waitForEnabled();
    await $("button=선택한 변경 승인").click();
    await browser.waitUntil(
      async () => (await $(".version-badge").getText()) === "v13",
    );
    await browser.waitUntil(async () =>
      browser.execute(() =>
        document.activeElement?.matches(".selected-group h3"),
      ),
    );
    const approved = await readFile(join(root, "review.md"), "utf8");
    await $("button=이번 적용 전 버전 비교·복원").click();
    await $(".restore-dialog").waitForDisplayed();
    assert.match(await $("#restore-title").getText(), /v12/);
    await browser.saveScreenshot(".artifacts/usability/applied-version.png");
    await $("button=복원 취소").click();
    assert.equal(await readFile(join(root, "review.md"), "utf8"), approved);
  });
  it("진행 중에는 코멘트 저장을 막고 중단 뒤 초안을 유지한다", async () =>
    checkBusyComment(fixture.task.id));
  it(
    "100개 변경은 선택 목록으로 탐색하고 일괄 승인 취소 시 원문을 유지한다",
    checkManyChanges,
  );
});

async function chooseScope(value) {
  await openScope();
  await browser.execute((value) => {
    const select = document.querySelector(".scope-bar select");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
