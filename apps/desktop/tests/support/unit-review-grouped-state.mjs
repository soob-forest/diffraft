import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  chooseUnit,
  closeUnitMenu,
  current,
  editor,
  reviewState,
  settleUnitLayout,
  setUnitFilter,
  showOriginalUnitComparison,
  showUnitComment,
} from "./unit-review-fixture.mjs";

export async function captureMainReview(fixture) {
  assert(
    fixture?.document?.id && fixture?.task?.id && fixture?.batch?.id,
    "복귀할 원래 문서·작업·검토를 지정해 주세요.",
  );
  const size = await browser.getWindowSize();
  const ui = await captureReviewUi();
  assert(
    Number.isFinite(ui.zoom) && ui.zoom > 0 && ui.zoom <= 4,
    "복귀 배율을 확인할 수 없습니다.",
  );
  assert.equal(ui.task, fixture.task.id);
  assert.equal(ui.batch, fixture.batch.id);
  if (ui.draft) await waitStoredComment();
  const state = await editor({ kind: "read", documentId: fixture.document.id });
  return {
    size,
    ui,
    title: state.document.title,
    invariant: await reviewInvariant(fixture),
  };
}

async function captureReviewUi() {
  return browser.execute(async () => {
    const native = globalThis.__TAURI__.window.getCurrentWindow();
    const physical = await native.innerSize(),
      scale = await native.scaleFactor();
    const root = document.querySelector(".unit-diff-body:not([hidden])");
    return {
      zoom: physical.width / scale / innerWidth,
      selected: document.querySelector(".unit-picker select").value,
      task: document.querySelector(".task-picker select")?.value,
      batch: document.querySelector(".review-header select")?.value,
      filter: document.querySelector(".unit-progress .unit-filter select")
        .value,
      original: !!document.querySelector(".unit-original-notice"),
      panelOpen:
        document.querySelector(".document-workspace").dataset.tasksOpen ===
        "true",
      detail:
        document
          .querySelector("#review-detail-tab")
          ?.getAttribute("aria-selected") === "true",
      draft: document.querySelector(".unit-comments textarea")?.value ?? null,
      documentsOpen:
        document.querySelector(".app-shell").dataset.documentsOpen !== "false",
      scroll: [...root.querySelectorAll(".cm-scroller")].map(
        (node) => node.scrollTop,
      ),
      workspaceTop: document.querySelector(".document-workspace").scrollTop,
    };
  });
}

async function waitStoredComment() {
  await browser.waitUntil(
    () =>
      browser.execute(() =>
        document
          .querySelector(".unit-comments .draft-status")
          ?.textContent.includes("기기에 저장됨"),
      ),
    {
      timeoutMsg:
        "문서를 떠나기 전에 원래 의견 초안의 실제 보관을 확인해야 합니다.",
    },
  );
}

export async function reviewInvariant(fixture) {
  const state = await editor({ kind: "read", documentId: fixture.document.id });
  const review = await reviewState(fixture.task.id);
  const { batch } = await current(fixture);
  assert.equal(batch.id, fixture.batch.id, "비교할 검토 회차가 달라졌습니다.");
  return {
    version: state.document.version,
    head: state.document.versionId,
    contentHash: state.document.contentHash,
    fileHash: createHash("sha256")
      .update(await readFile(state.document.path))
      .digest("hex"),
    decisions: batch.proposals.map(({ id, revision, decision }) => ({
      id,
      revision,
      decision,
    })),
    comments: review.unitComments.map(({ id, revision, status }) => ({
      id,
      revision,
      status,
    })),
  };
}

export async function setGroupedSize(width, height, zoom) {
  await browser.setWindowSize(width, height);
  await browser.execute(async (scale) => {
    const native = globalThis.__TAURI__.window.getCurrentWindow();
    await native.show();
    await native.setFocus();
    await globalThis.__TAURI__.webview.getCurrentWebview().setZoom(scale);
  }, zoom);
  await settleUnitLayout();
}

export async function closeGroupedDetail() {
  if (await $("button=본문으로 돌아가기").isDisplayed())
    await $("button=본문으로 돌아가기").click();
  else if (await $("button=작업 패널 접기").isDisplayed())
    await $("button=작업 패널 접기").click();
  await settleUnitLayout();
}

export async function restoreMainReview(fixture, saved) {
  await closeUnitMenu();
  await setGroupedSize(saved.size.width, saved.size.height, saved.ui.zoom);
  await browser.execute((title) => {
    const target = [...document.querySelectorAll(".sidebar button")].find(
      (button) => button.textContent.trim() === title,
    );
    if (!target)
      throw new Error("복귀할 문서를 문서 목록에서 찾을 수 없습니다.");
    target.click();
  }, saved.title);
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === saved.title,
  );
  await settleUnitLayout();
  await chooseMainTask(fixture.task.id);
  await $("button=변경 검토").click();
  await $(".unit-review").waitForDisplayed();
  await restoreBatch(fixture.batch.id);
  await closeGroupedDetail();
  await setUnitFilter(saved.ui.filter);
  if (saved.ui.selected) await chooseUnit(saved.ui.selected);
  if (saved.ui.original) await showOriginalUnitComparison();
  else if (await $(".unit-original-notice").isExisting())
    await $("button=현재 검토로 돌아가기").click();
  await $(".unit-diff-body:not([hidden]) .cm-content").waitForDisplayed();
  await restoreMainPanel(saved.ui);
  await restoreMainScroll(saved.ui);
  const restored = await current(fixture);
  assert.equal(restored.batch.id, fixture.batch.id);
  assert.deepEqual(await reviewInvariant(fixture), saved.invariant);
  await mkdir(".artifacts/unit-review/after", { recursive: true });
  await writeFile(
    ".artifacts/unit-review/after/grouped-restored.json",
    JSON.stringify(
      {
        documentId: fixture.document.id,
        taskId: fixture.task.id,
        batchId: fixture.batch.id,
        selected: saved.ui.selected,
        filter: saved.ui.filter,
        draftLength: saved.ui.draft?.length ?? 0,
      },
      null,
      2,
    ),
  );
}

async function chooseMainTask(id) {
  await $(".task-picker select").waitForExist();
  await browser.execute((value) => {
    const select = document.querySelector(".task-picker select");
    if (
      !select ||
      ![...select.options].some((option) => option.value === value)
    )
      throw new Error("복귀할 원래 작업을 찾을 수 없습니다.");
    if (select.value === value) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, id);
  await browser.waitUntil(() =>
    browser.execute(
      (value) => document.querySelector(".task-picker select")?.value === value,
      id,
    ),
  );
}

async function restoreBatch(id) {
  await $(".review-header select").waitForExist();
  await browser.execute((value) => {
    const select = document.querySelector(".review-header select");
    if (
      !select ||
      ![...select.options].some((option) => option.value === value)
    )
      throw new Error("복귀할 원래 검토 회차를 찾을 수 없습니다.");
    if (select.value === value) return;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, id);
  await browser.waitUntil(() =>
    browser.execute(
      (value) =>
        document.querySelector(".review-header select")?.value === value,
      id,
    ),
  );
}

async function restoreMainPanel(ui) {
  if (ui.panelOpen) {
    if (ui.detail) await showUnitComment();
    else {
      await $(".workspace-controls button").click();
      await $(".panel-tabs").$("button=작업·대화").click();
    }
  }
  const draft = await browser.execute(
    () => document.querySelector(".unit-comments textarea")?.value ?? null,
  );
  assert(
    draft === ui.draft,
    "읽기 검증의 왕복 후 원래 의견 초안이 달라졌습니다.",
  );
  await browser.execute((open) => {
    const shell = document.querySelector(".app-shell");
    if ((shell.dataset.documentsOpen !== "false") !== open)
      document.querySelector(".document-list-toggle")?.click();
  }, ui.documentsOpen);
}

async function restoreMainScroll(ui) {
  await browser.execute((saved) => {
    const root = document.querySelector(".unit-diff-body:not([hidden])");
    [...root.querySelectorAll(".cm-scroller")].forEach((node, index) => {
      node.scrollTop = saved.scroll[index] ?? 0;
    });
    document.querySelector(".document-workspace").scrollTop =
      saved.workspaceTop;
  }, ui);
  await settleUnitLayout();
}
