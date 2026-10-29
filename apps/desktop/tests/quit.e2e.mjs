import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  assertWindowAliveAtExit,
  waitForNormalExit,
} from "./support/app-exit.mjs";
import { editor, invoke } from "./support/review-fixture.mjs";

const iteration = Number(process.env.DOCREVIEW_QUIT_CASE);
const methods = ["native", "window", "menu-quit", "application-quit"];
const method = methods[iteration % methods.length];
assert(Number.isInteger(iteration) && iteration >= 0 && method);

describe(`종료 반복 ${iteration + 1} / ${method}`, () => {
  it("크기 변경·편집 직후 정상 종료하고 원문을 보존한다", async () => {
    const document = await newDocument();
    const pid = await invoke("e2e_process_id", {});
    const content = `종료 반복 검증 ${iteration} · 한글 😀`;
    await browser.execute(
      async (small) => {
        const window = globalThis.__TAURI__.window;
        await window
          .getCurrentWindow()
          .setSize(
            new window.LogicalSize(small ? 800 : 1440, small ? 600 : 900),
          );
      },
      iteration % 2 === 0,
    );
    await $('[data-testid="source-editor"]').click();
    await $('[data-testid="source-editor"]').addValue(content);
    await requestQuit(pid);
    await waitForNormalExit(pid);
    await assertWindowAliveAtExit(pid);
    assert.equal(await readFile(document.path, "utf8"), content);
  });
});

async function newDocument() {
  const before = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  await $("button=새 문서").click();
  await browser.waitUntil(async () => {
    const current = await invoke("get_workspace_snapshot", {
      request: { schemaVersion: 1 },
    });
    return current.selectedDocumentId !== before.selectedDocumentId;
  });
  await $('[data-testid="source-editor"]').waitForDisplayed();
  await browser.waitUntil(
    async () => (await $('[data-testid="source-editor"]').getText()) === "",
  );
  const snapshot = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  return (
    await editor({ kind: "read", documentId: snapshot.selectedDocumentId })
  ).document;
}

async function requestQuit(pid) {
  if (method === "native" || method === "window") {
    await browser.execute((kind) => {
      if (kind === "native")
        void window.__TAURI__.core.invoke("e2e_request_native_exit");
      else void window.__TAURI__.window.getCurrentWindow().close();
    }, method);
    return;
  }
  execFileSync(
    process.env.DOCREVIEW_NATIVE_QUIT_HELPER,
    [
      String(pid),
      fileURLToPath(
        new URL("../src-tauri/target/debug/docreview", import.meta.url),
      ),
      method,
    ],
    { timeout: 5000, stdio: "pipe" },
  );
}
