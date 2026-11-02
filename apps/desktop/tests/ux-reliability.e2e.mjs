import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { showTaskPanel, terminal } from "./support/generation-fixture.mjs";
import { editor, invoke, prepare, root } from "./support/review-fixture.mjs";
import { chooseGroup } from "./support/review-ui.mjs";

let fixture, firstTask, badKey;
const requestKey = (doc, task) => JSON.stringify(["request", doc, task]);
async function saved() {
  await browser.waitUntil(async () =>
    (await $("footer .draft-status").getText()).includes("저장됨"),
  );
  return editor({ kind: "read_drafts" });
}
async function returnToFixture() {
  await $(".sidebar").$(`button=${fixture.document.title}`).click();
  await browser.waitUntil(
    async () =>
      (await $(".document-toolbar h1").getText()) === fixture.document.title,
  );
  await $("button=원문").click();
  await showTaskPanel();
}

async function requestKindRecovery() {
  await mkdir(".artifacts/draft-reliability", { recursive: true });
  fixture = await prepare("conflict-review");
  await showTaskPanel();
  await $(".request-kind").$("button=전체 재작성").click();
  await $(".request-form textarea").setValue("전체 재작성 실패 지시");
  await $(".request-form").$("button=요청 내용 확인").click();
  await $(".generation-dialog").waitForDisplayed();
  await writeFile(join(root, "next-generation"), "malformed");
  await $(".generation-dialog").$("button=확인 후 요청").click();
  assert.equal((await terminal(fixture.task.id)).lastAttempt.status, "FAILED");
  await $(".request-kind").$("button=설명").waitForEnabled();
  await $(".request-kind").$("button=설명").click();
  await $(".request-form textarea").setValue("설명 초안 유지");
  await $(".attempt-recovery").$("button=내용을 수정해 새로 요청").click();
  await assertRewriteDraft();
  await $(".request-form textarea").setValue("새 재작성 초안");
  await $(".request-kind").$("button=설명").click();
  assert.equal(await $(".request-form textarea").getValue(), "설명 초안 유지");
  await $(".attempt-recovery").$("button=내용을 수정해 새로 요청").click();
  await $("button=현재 초안 유지").click();
  assert.equal(await $(".request-form textarea").getValue(), "설명 초안 유지");
  await $(".attempt-recovery").$("button=내용을 수정해 새로 요청").click();
  await $("button=이전 지시 가져오기").click();
  await assertRewriteDraft();
  await browser.saveScreenshot(".artifacts/draft-reliability/request-kind.png");
}

async function sourceScopeRecovery() {
  fixture = await prepare("review");
  await chooseGroup(2);
  await $("button=선택한 변경 승인").waitForEnabled();
  await $("button=선택한 변경 승인").click();
  await browser.waitUntil(
    async () =>
      (await editor({ kind: "read", documentId: fixture.document.id })).document
        .versionId !== fixture.batch.applyHeadId,
  );
  await $("button=원문").click();
  await showTaskPanel();
  await $(".request-kind").$("button=부분 수정").click();
  await $('[data-testid="source-editor"]').click();
  await browser.keys([Key.Command, Key.Home]);
  await browser.keys([
    Key.Shift,
    Key.ArrowRight,
    Key.ArrowRight,
    Key.ArrowRight,
  ]);
  await $(".scope-bar").$("button=변경").click();
  await browser.execute(() => {
    const select = document.querySelector(".scope-bar select");
    select.value = "selection";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await $(".scope-bar").$("button=범위 확인").click();
  const change = $("button=지시를 유지하고 대상 변경");
  if (await change.isExisting()) await change.click();
  await $(".request-form textarea").setValue("고정 선택을 재확인");
  const scope = await savedScope();
  assert.ok(scope.captured.epoch > 0);
  await $(".document-actions").$("button=새 문서").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "새 문서",
  );
  await returnToFixture();
  await $(".request-form").$("button=요청 내용 확인").click();
  await $(".generation-dialog").waitForDisplayed();
  assert.match(
    await $(".generation-dialog").getText(),
    new RegExp(
      scope.captured.value.quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ),
  );
  await $(".generation-dialog").$("button=요청 취소").click();
  await browser.saveScreenshot(".artifacts/draft-reliability/source-scope.png");
}

async function firstRequestRecovery() {
  await $(".document-actions").$("button=새 문서").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "새 문서",
  );
  await showTaskPanel();
  await $(".task-conditions textarea[required]").waitForDisplayed();
  await $(".task-conditions textarea[required]").setValue("취소한 첫 요청");
  await $(
    '.task-conditions textarea[placeholder="예: 수치를 유지하고 이 안내를 간결하게 다듬어 주세요."]',
  ).setValue("첫 확인 취소 지시");
  await $("button=작업 만들고 요청 확인").click();
  await $(".generation-dialog").waitForDisplayed();
  await $(".generation-dialog").$("button=요청 취소").click();
  const workspace = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  firstTask = {
    documentId: workspace.selectedDocumentId,
    taskId: await $(".task-picker select").getValue(),
  };
  const records = await saved();
  assert.equal(
    JSON.parse(
      records.find(
        (r) => r.key === requestKey(firstTask.documentId, firstTask.taskId),
      ).valueJson,
    ).prepareOnOpen,
    false,
  );
  await seedMalformedCandidate();
  await writeFile(
    join(root, "reliability-expected.json"),
    JSON.stringify({ fixture, firstTask, badKey }),
  );
}

describe("요청 복원과 초안 격리", () => {
  afterEach(async function () {
    if (this.currentTest.state !== "failed") return;
    await browser.saveScreenshot(".artifacts/draft-reliability/failure.png");
    await writeFile(
      ".artifacts/draft-reliability/failure.json",
      JSON.stringify(
        await browser.execute(() => ({
          fields: [
            ...document.querySelectorAll(".task-conditions textarea"),
          ].map((node) => ({
            required: node.required,
            rect: node.getBoundingClientRect().toJSON(),
            hidden: node.closest("[hidden]")?.className,
            details: node.closest("details")?.open,
          })),
          viewport: [innerWidth, innerHeight],
        })),
      ),
    );
  });
  it(
    "실패한 전체 재작성의 종류를 복원하고 종류별 지시와 교체 선택을 보존한다",
    requestKindRecovery,
  );
  it(
    "승인 뒤 고정한 원문 선택을 문서 왕복 후 같은 인용으로 확인한다",
    sourceScopeRecovery,
  );
  it(
    "첫 요청 취소를 저장하고 손상 초안 원본을 재실행 검사에 남긴다",
    firstRequestRecovery,
  );
});

async function assertRewriteDraft() {
  assert.equal(
    await $(".request-kind")
      .$("button=전체 재작성")
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await $(".request-form textarea").getValue(),
    "전체 재작성 실패 지시",
  );
}

async function savedScope() {
  const records = await saved();
  const scopeKey = JSON.stringify([
    "source-scope",
    fixture.document.id,
    fixture.task.id,
  ]);
  const scope = JSON.parse(
    records.find((record) => record.key === scopeKey).valueJson,
  );
  return scope;
}

async function seedMalformedCandidate() {
  const proposal = fixture.batch.proposals.find((p) =>
    p.operation.headingPath.at(-1).startsWith("1."),
  );
  badKey = JSON.stringify([
    "candidate",
    fixture.document.id,
    fixture.task.id,
    fixture.batch.id,
    proposal.id,
    "1",
  ]);
  await editor({
    kind: "write_draft",
    draft: {
      key: badKey,
      schemaVersion: 1,
      expectedRevision: 0,
      valueJson: '{"after":null}',
    },
  });
}
