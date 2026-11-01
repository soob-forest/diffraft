import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { invoke } from "./support/review-fixture.mjs";

describe("Codex 설정의 실제 macOS 키보드 조작", () => {
  it("OS select·Tab·저장·Escape와 포커스 복귀를 확인한다", async () => {
    await $("button=AI 연결 설정").click();
    await $("#ai-provider").waitForEnabled();
    const pid = await invoke("e2e_process_id", {});
    await browser.execute(() => document.querySelector("#ai-provider").focus());
    nativeKeys(pid, [49, 125, 36]);
    await browser.waitUntil(
      async () => (await $("#ai-provider").getValue()) === "claude",
    );
    nativeKeys(pid, [49, 126, 36]);
    await browser.waitUntil(
      async () => (await $("#ai-provider").getValue()) === "codex",
    );
    await $("button=상태·모델 목록 조회").click();
    await $("button=상태·모델 목록 조회").waitForEnabled();
    await browser.execute(() => document.querySelector("#codex-model").focus());
    nativeKeys(pid, [49, 115, 125, 36]);
    await browser.waitUntil(
      async () => (await $("#codex-model").getValue()) === "fixture-codex",
    );
    nativeKeys(pid, [48]);
    assert.equal(
      await browser.execute(() => document.activeElement.textContent),
      "모델 설정 저장",
    );
    nativeKeys(pid, [36]);
    await browser.waitUntil(
      async () => !(await $("button=모델 설정 저장").isEnabled()),
    );
    const prefs = await invoke("ai_settings_command", {
      request: { schemaVersion: 1, action: { kind: "read" } },
    });
    assert.equal(prefs.codexModel.model, "fixture-codex");
    nativeKeys(pid, [53]);
    await browser.waitUntil(
      async () => !(await $(".connection-dialog").isExisting()),
    );
    assert.match(
      await browser.execute(() => document.activeElement.textContent),
      /AI 연결 설정|문서 목록/,
    );
  });
});

function nativeKeys(pid, keys) {
  assert(Number.isInteger(pid) && pid > 0);
  assert(keys.every((key) => [36, 48, 49, 53, 115, 125, 126].includes(key)));
  const application = new URL(
    "../src-tauri/target/debug/docreview",
    import.meta.url,
  ).pathname;
  const helper = new URL("../.artifacts/native-keyboard", import.meta.url)
    .pathname;
  try {
    execFileSync(helper, [String(pid), application, ...keys.map(String)], {
      timeout: 5000,
      stdio: "pipe",
    });
  } catch (error) {
    throw new Error(
      `Native keyboard: ${error.code ?? error.status}; ${String(error.stderr ?? "").slice(0, 300)}`,
    );
  }
}
