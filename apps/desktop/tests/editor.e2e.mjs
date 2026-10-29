import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { openScope, saveDocument } from "./support/review-ui.mjs";

const root = process.env.DOCREVIEW_E2E_DATA;
const source = '[data-testid="source-editor"]';
const saved = '[data-testid="save-status"]';
async function invoke(command, args) {
  return browser.execute(
    (name, payload) => window.__TAURI__.core.invoke(name, payload),
    command,
    args,
  );
}
async function open(name, create = false) {
  const title = create ? "새 문서" : name;
  if (!create) await writeFile(join(root, "next-pick"), name);
  await $(create ? "button=새 문서" : "button=문서 열기").click();
  await browser.waitUntil(async () =>
    browser.execute(
      (title) =>
        document.querySelector(".document-toolbar h1")?.textContent === title,
      title,
    ),
  );
  await $(source).waitForDisplayed();
  const snapshot = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  return snapshot.documents.find((document) => document.title === title);
}
async function replace(text) {
  const editor = await $(source);
  await editor.click();
  await browser.keys([Key.Command, "a"]);
  await editor.addValue(text);
}

describe("실제 파일 편집과 저장", () => {
  it("Unicode 원문을 편집하고 실제 디스크·버전에 자동 저장한다", async () => {
    const document = await open("document");
    await replace("# 저장한 문서\n\n한글 😀 저장 확인\n");
    await browser.waitUntil(
      async () => (await $(saved).getText()) === "원문 저장됨",
    );
    const disk = await readFile(join(root, "document.md"), "utf8");
    assert.equal(disk, "# 저장한 문서\r\n\r\n한글 😀 저장 확인\r\n");
    const state = await invoke("editor_command", {
      request: {
        schemaVersion: 1,
        action: { kind: "read", documentId: document.id },
      },
    });
    assert.equal(state.value.document.version, 2);
    assert.equal(state.value.versions.length, 2);
    await $(".task-conditions textarea[required]").setValue("사실과 수치 유지");
    await $(".task-conditions textarea:not([required])").setValue(
      "한국어로 간결하게",
    );
    await $('.task-panel button[type="submit"]').click();
    await browser.waitUntil(
      async () => (await $(".task-panel select").getValue()) !== "",
    );
    await writeFile(
      join(root, "expected.json"),
      JSON.stringify({
        id: document.id,
        content: disk,
        processId: await invoke("e2e_process_id", {}),
      }),
    );
  });
  it("미리보기와 범위 확인이 저장된 버전을 사용한다", async () => {
    await $("button=미리보기").click();
    await $(".markdown-preview h1").waitForDisplayed();
    assert.equal(await $(".markdown-preview h1").getText(), "저장한 문서");
    await $("button=원문").click();
    await openScope();
    await $("button=범위 확인").click();
    await browser.waitUntil(async () =>
      (await $('.scope-bar [role="status"]').getText()).includes("v2"),
    );
    await mkdir(".artifacts", { recursive: true });
    await browser.saveScreenshot(".artifacts/local-editor.png");
  });
  it("새 문서를 만들고 이동 전에 저장한다", async () => {
    const document = await open("new", true);
    const state = await invoke("editor_command", {
      request: {
        schemaVersion: 1,
        action: { kind: "read", documentId: document.id },
      },
    });
    assert.ok(state.value.document.path.includes("/data/documents/"));
    await replace("# 새 문서 입력");
    await $(".sidebar").$("button=document").click();
    await browser.waitUntil(async () =>
      browser.execute(
        () =>
          document.querySelector(".document-toolbar h1")?.textContent ===
          "document",
      ),
    );
    assert.equal(
      await readFile(state.value.document.path, "utf8"),
      "# 새 문서 입력",
    );
  });
  it("1 MiB 문서를 열고 실제 화면 표시 시간을 기록한다", async () => {
    const started = performance.now();
    await open("large");
    const elapsedMs = performance.now() - started;
    const bytes = (await readFile(join(root, "large.md"))).length;
    assert.equal(bytes, 1024 * 1024);
    await mkdir(".artifacts", { recursive: true });
    await writeFile(
      ".artifacts/editor-performance.json",
      JSON.stringify(
        {
          bytes,
          elapsedMs,
          build: "debug",
          platform: process.platform,
          arch: process.arch,
        },
        null,
        2,
      ),
    );
    assert.ok(elapsedMs < 2000, `1 MiB 열기 ${Math.round(elapsedMs)} ms`);
  });
  it("외부 수정은 자동 저장을 중단하고 외부 파일을 유지한다", async () => {
    await $(".sidebar").$("button=document").click();
    await $(source).waitForDisplayed();
    await writeFile(join(root, "document.md"), "# 외부 내용\n");
    await browser.waitUntil(
      async () => (await $(saved).getText()) === "원문 저장 중지",
    );
    await replace("앱의 새 입력 보존");
    await saveDocument();
    assert.equal(
      await readFile(join(root, "document.md"), "utf8"),
      "# 외부 내용\n",
    );
    assert.match(await $(source).getText(), /새 입력 보존/);
    await $(source).click();
    await browser.keys([Key.Command, "z"]);
  });
  it("읽기 전용 저장 실패 시 입력을 유지하고 문서 이동을 막는다", async () => {
    await open("readonly");
    await replace("입력은 보존되어야 합니다 😀");
    await browser.waitUntil(
      async () => (await $(saved).getText()) === "원문 저장 중지",
    );
    assert.match(await $(source).getText(), /보존되어야/);
    assert.equal(
      await readFile(join(root, "readonly.md"), "utf8"),
      "# 읽기 전용\n원문 유지\n",
    );
    await $(".sidebar").$("button=document").click();
    assert.equal(await $(".document-toolbar h1").getText(), "readonly");
    assert.match(await $(".workspace-body").getText(), /권한/);
  });
});
