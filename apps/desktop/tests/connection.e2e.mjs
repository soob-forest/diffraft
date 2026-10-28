import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { invoke, root } from "./support/review-fixture.mjs";

const request = { schemaVersion: 1 };
async function status() {
  return invoke("generation_snapshot", { request });
}
async function inspect(mode) {
  await writeFile(join(root, "next-connection"), mode);
  await $("button=상태 다시 확인").click();
  await browser.waitUntil(
    async () => await $("button=상태 다시 확인").isEnabled(),
  );
}
describe("공식 CLI 연결 화면과 생성 수명", () => {
  it("최소 버전 미달을 안내하고 최신 버전의 연결 테스트를 허용한다", async () => {
    await $("button=AI 연결 설정").click();
    await inspect("TOO_OLD");
    const dialog = $(".connection-dialog");
    assert.match(await dialog.getText(), /2\.1\.295 이상 정식 버전/);
    assert.match(await dialog.getText(), /2\.1\.294/);
    assert.equal(await $("button=연결 테스트").isEnabled(), false);
    await inspect("READY");
    assert.match(await dialog.getText(), /2\.1\.312/);
    assert.equal(await $("button=연결 테스트").isEnabled(), true);
    await $("button=설정 닫기").click();
  });

  it("미설치·로그인 필요 상태에서도 로컬 문서를 만들 수 있다", async () => {
    await $("button=AI 연결 설정").click();
    await inspect("MISSING");
    assert.match(
      await $('[data-testid="connection-status"]').getText(),
      /찾을 수 없습니다/,
    );
    assert.equal(await $("button=연결 테스트").isEnabled(), false);
    await inspect("AUTH_REQUIRED");
    assert.match(
      await $('[data-testid="connection-status"]').getText(),
      /로그인/,
    );
    await $("button=설정 닫기").click();
    assert.equal(
      await browser.execute(() => document.activeElement.textContent),
      "AI 연결 설정",
    );
    await $("button=새 문서").click();
    await $(".source-editor .cm-content").waitForExist();
  });

  it("연결 테스트 성공과 잘못된 출력은 확정본을 바꾸지 않는다", async () => {
    const before = await invoke("get_workspace_snapshot", { request });
    await $("button=AI 연결 설정").click();
    await inspect("READY");
    await writeFile(join(root, "next-generation"), "EXPLAIN");
    await $("button=연결 테스트").click();
    await browser.waitUntil(async () =>
      (await $('[data-testid="connection-status"]').getText()).includes("성공"),
    );
    await mkdir(".artifacts", { recursive: true });
    await browser.saveScreenshot(".artifacts/connection-ready.png");
    await writeFile(join(root, "next-generation"), "malformed");
    await $("button=연결 테스트").click();
    await $(".connection-dialog [role='alert']").waitForDisplayed();
    assert.match(
      await $(".connection-dialog [role='alert']").getText(),
      /형식/,
    );
    assert.deepEqual(
      await invoke("get_workspace_snapshot", { request }),
      before,
    );
    assert.equal((await status()).operationId, null);
    await $("button=설정 닫기").click();
  });

  it("중단 시 프로세스 종료까지 기다리며 동시에 두 번째 요청을 시작하지 않는다", async () => {
    await $("button=AI 연결 설정").click();
    await inspect("READY");
    await writeFile(join(root, "next-generation"), "EXPLAIN_DELAY");
    await $("button=연결 테스트").click();
    await browser.waitUntil(async () => Boolean((await status()).operationId));
    await browser.waitUntil(async () => {
      try {
        return Boolean(
          JSON.parse(
            await readFile(join(root, "data/cli-process.json"), "utf8"),
          ).process,
        );
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    });
    const duplicate = await browser.execute(async () => {
      try {
        await window.__TAURI__.core.invoke("connection_command", {
          request: {
            schemaVersion: 1,
            action: { kind: "test", operation_id: crypto.randomUUID() },
          },
        });
        return null;
      } catch (error) {
        return error;
      }
    });
    assert.equal(duplicate.code, "BUSY");
    await $("button=연결 요청 중단").click();
    await browser.waitUntil(async () => (await status()).operationId === null);
    await browser.waitUntil(
      async () => await $("button=설정 닫기").isEnabled(),
    );
    assert.match(
      await $(".connection-dialog [role='alert']").getText(),
      /중단/,
    );
    await $("button=설정 닫기").click();
  });
});
