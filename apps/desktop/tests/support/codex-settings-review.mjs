import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { invoke, root } from "./review-fixture.mjs";

export async function settingsReview() {
  await $("button=AI 연결 설정").click();
  await $("#codex-model").waitForEnabled();
  await writeFile(join(root, "next-codex-connection"), "AUTH_REQUIRED");
  await $("button=상태·모델 목록 조회").click();
  await $(".connection-dialog [role=alert]").waitForDisplayed();
  assert.match(
    await $(".connection-dialog [role=alert]").getText(),
    /로그인|인증/,
  );
  await captureLayouts("settings-error", ".connection-dialog", "#codex-model");
  await $(".connection-diagnostics summary").click();
  await $("#codex-path").setValue("relative/codex");
  await $("button=실행 경로 저장").click();
  await browser.waitUntil(async () =>
    (await $(".connection-dialog [role=alert]").getText()).includes(
      "절대 경로",
    ),
  );
  assert.equal(await $("#codex-path").getValue(), "relative/codex");
  const prefs = await invoke("ai_settings_command", {
    request: { schemaVersion: 1, action: { kind: "read" } },
  });
  assert.equal(prefs.codexPath, null);
  await $("#codex-path").setValue("");
  await writeFile(join(root, "next-codex-connection"), "SUCCESS");
  await $("button=상태·모델 목록 조회").click();
  await $("button=상태·모델 목록 조회").waitForEnabled();
  await $("button=설정 닫기").scrollIntoView();
  await $("button=설정 닫기").click();
  assert.equal(await $(".connection-dialog").isExisting(), false);
}

export async function captureLayouts(name, dialogSelector, controlSelector) {
  await mkdir(".artifacts/codex", { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [800, 600],
  ]) {
    await browser.setWindowSize(width, height);
    for (const scale of [1, 1.5, 2]) {
      await browser.execute(
        async (value) =>
          globalThis.__TAURI__.webview.getCurrentWebview().setZoom(value),
        scale,
      );
      const bounds = await browser.execute(
        (dialogSelector, controlSelector) => {
          const dialog = document.querySelector(dialogSelector);
          const control = document.querySelector(controlSelector);
          control.scrollIntoView({ block: "nearest" });
          const box = control.getBoundingClientRect();
          return {
            overflow: dialog.scrollWidth > dialog.clientWidth + 1,
            visible:
              box.left >= 0 &&
              box.right <= innerWidth &&
              box.top >= 0 &&
              box.bottom <= innerHeight,
          };
        },
        dialogSelector,
        controlSelector,
      );
      assert.equal(bounds.overflow, false);
      assert.equal(bounds.visible, true);
      await browser.saveScreenshot(
        `.artifacts/codex/${name}-${width}-${scale}.png`,
      );
    }
  }
  await browser.execute(async () =>
    globalThis.__TAURI__.webview.getCurrentWebview().setZoom(1),
  );
  await browser.setWindowSize(1440, 900);
}
