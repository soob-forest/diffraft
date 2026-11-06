import assert from "node:assert/strict";
import { chooseRequestMode, showTaskPanel } from "./generation-fixture.mjs";
import { editor, invoke } from "./review-fixture.mjs";
import { selectSource } from "./source-ui.mjs";

async function holdModelResponse() {
  await browser.execute(() => {
    if (globalThis.__requestModelHold) throw new Error("already installed");
    const state = {
      original: globalThis.fetch,
      descriptor: Object.getOwnPropertyDescriptor(globalThis, "fetch"),
      url: globalThis.__TAURI_INTERNALS__.convertFileSrc(
        "resolve_request_model",
        "ipc",
      ),
      armed: true,
      held: false,
    };
    globalThis.__requestModelHold = state;
    const wrapper = async (input, options) => {
      const url =
        typeof input === "string" ? input : (input?.url ?? input?.href);
      const hold =
        state.armed && url === state.url && options?.method === "POST";
      if (hold) state.armed = false;
      const response = await state.original.call(globalThis, input, options);
      if (!hold) return response;
      return new Promise((resolve) => {
        state.release = () => resolve(response);
        state.held = true;
      });
    };
    Object.defineProperty(
      globalThis,
      "fetch",
      state.descriptor?.configurable === false
        ? { ...state.descriptor, value: wrapper }
        : { value: wrapper, configurable: true, writable: true },
    );
    if (globalThis.fetch !== wrapper) throw new Error("hold not installed");
  });
}
async function releaseModelResponse() {
  await browser.execute(() => {
    const state = globalThis.__requestModelHold;
    if (!state) return;
    if (state.descriptor)
      Object.defineProperty(globalThis, "fetch", state.descriptor);
    else delete globalThis.fetch;
    state.release?.();
    if (globalThis.fetch !== state.original)
      throw new Error("fetch not restored");
    delete globalThis.__requestModelHold;
  });
}
async function changeDuringPreparation(settings, submit) {
  await holdModelResponse();
  try {
    await $(submit).click();
    await browser.waitUntil(() =>
      browser.execute(() => !!globalThis.__requestModelHold?.held),
    );
    await settings("opus");
  } finally {
    await releaseModelResponse();
  }
}
export async function verifyGeneralPreparationRace(settings) {
  await settings("sonnet");
  await showTaskPanel();
  await chooseRequestMode("PATCH");
  await $(".request-form textarea").setValue(
    "준비 중 변경에도 보존할 일반 지시",
  );
  await changeDuringPreparation(settings, ".request-form button[type=submit]");
  await browser.waitUntil(async () =>
    (await $(".generation-panel").getText()).includes("다시 확인해 주세요"),
  );
  assert.equal(await $(".generation-dialog").isExisting(), false);
  assert.equal(
    await $(".request-form textarea").getValue(),
    "준비 중 변경에도 보존할 일반 지시",
  );
  await $(".request-form button[type=submit]").click();
  await $(".generation-dialog").waitForDisplayed();
  assert.match(await $(".generation-dialog .request-model").getText(), /Opus/);
  await browser.saveScreenshot(
    ".artifacts/request-followup/general-preparation-renewed.png",
  );
  await $("button=요청 취소").click();
}
export async function verifySelectedPreparationRace(settings) {
  await settings("sonnet");
  await $("button=원문").click();
  await selectSource("출발 시간과 이동 경로를 함께 기록합니다.", true);
  await $(".selection-context").$("button=이 부분 수정").click();
  const form = ".source-selection-panel";
  await $(`${form} textarea`).setValue("준비 중 변경에도 보존할 선택 지시");
  const quote = await $(`${form} .quote-text`).getText();
  await changeDuringPreparation(settings, `${form} button[type=submit]`);
  await browser.waitUntil(async () =>
    (await $(form).getText()).includes("다시 확인해 주세요"),
  );
  await $(`${form} button[type=submit]`).waitForEnabled();
  assert.equal(await $(`${form} .selection-confirmation`).isExisting(), false);
  assert.equal(
    await $(`${form} textarea`).getValue(),
    "준비 중 변경에도 보존할 선택 지시",
  );
  assert.equal(await $(`${form} .quote-text`).getText(), quote);
  await $(`${form} button[type=submit]`).click();
  await $(`${form} .selection-confirmation`).waitForDisplayed();
  assert.match(await $(`${form} .request-model`).getText(), /Opus/);
  await browser.saveScreenshot(
    ".artifacts/request-followup/selected-preparation-renewed.png",
  );
  await $(`${form}`).$("button=지시로 돌아가기").click();
}
export async function verifyFirstSourceDismiss() {
  const form = ".source-selection-panel";
  await $(`${form} textarea`).setValue("첫 선택 취소 뒤에도 보존할 지시");
  const line = await $(".source-editor .cm-line");
  await browser
    .action("pointer")
    .move({ origin: line, x: 8, y: 0 })
    .down({ button: 0 })
    .up({ button: 0 })
    .perform();
  await browser.waitUntil(async () => !(await $(form).isExisting()));
  await browser.waitUntil(async () =>
    (await $("footer .draft-status").getText()).includes("저장됨"),
  );
  await assertNoTaskDraft();
  await selectSource("보존할 문장입니다.");
  await $(".selection-context").$("button=이 부분 수정").click();
  await $(`${form} textarea`).waitForDisplayed();
  assert.equal(
    await $(`${form} textarea`).getValue(),
    "첫 선택 취소 뒤에도 보존할 지시",
  );
  await browser.saveScreenshot(
    ".artifacts/selection-popover/first-click-dismiss-resumed.png",
  );
}
async function assertNoTaskDraft() {
  const workspace = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  const state = await editor({
    kind: "read",
    documentId: workspace.selectedDocumentId,
  });
  assert.equal(state.tasks.length, 0);
  const records = await editor({ kind: "read_drafts" });
  assert.equal(
    records.some((record) => {
      const parts = JSON.parse(record.key);
      return (
        parts[0] === "selected-request" &&
        parts[1] === state.document.id &&
        !parts[2]
      );
    }),
    false,
  );
}
