import assert from "node:assert/strict";

describe("제품 앱과 실제 Rust IPC", () => {
  it("계정 없이 빈 작업 공간을 연다", async () => {
    const status = await $('[data-testid="workspace-status"]');
    await browser.waitUntil(
      async () => (await status.getText()) === "작업 공간 준비됨",
    );
    const snapshot = await browser.execute(() =>
      window.__TAURI__.core.invoke("get_workspace_snapshot", {
        request: { schemaVersion: 1 },
      }),
    );
    assert.deepEqual(snapshot, {
      schemaVersion: 1,
      sequence: 0,
      documents: [],
      selectedDocumentId: null,
    });
  });
  it("지원하지 않는 요청 버전은 구체적인 오류로 거부한다", async () => {
    const result = await browser.execute(async () => {
      try {
        await window.__TAURI__.core.invoke("get_workspace_snapshot", {
          request: { schemaVersion: 999 },
        });
        return null;
      } catch (error) {
        return error;
      }
    });
    assert.equal(result.code, "SCHEMA_UNSUPPORTED");
    assert.match(result.message, /요청 버전/);
  });
});
