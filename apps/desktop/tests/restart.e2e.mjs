import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("다음 앱 프로세스의 저장소 복원", () => {
  it("저장된 원문·버전·작업을 복원하고 외부 충돌을 표시한다", async () => {
    const expected = JSON.parse(
      await readFile(
        join(process.env.DOCREVIEW_E2E_DATA, "expected.json"),
        "utf8",
      ),
    );
    await $('[data-testid="source-editor"]').waitForDisplayed();
    const processId = await browser.execute(() =>
      window.__TAURI__.core.invoke("e2e_process_id"),
    );
    assert.notEqual(processId, expected.processId);
    assert.equal(await $(".document-toolbar h1").getText(), "readonly");
    await $(".sidebar").$("button=document").click();
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "document",
    );
    const state = await browser.execute(
      (id) =>
        window.__TAURI__.core.invoke("editor_command", {
          request: {
            schemaVersion: 1,
            action: { kind: "read", documentId: id },
          },
        }),
      expected.id,
    );
    assert.equal(state.value.document.content, expected.content);
    assert.equal(state.value.document.version, 2);
    assert.equal(state.value.document.status, "CONFLICT");
    assert.equal(state.value.tasks[0].goal, "사실과 수치 유지");
    assert.equal(state.value.tasks[0].pinnedRules, "한국어로 간결하게");
    assert.equal(
      await $('[data-testid="save-status"]').getText(),
      "원문 저장 중지",
    );
  });
});
