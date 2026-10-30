import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { invoke, root } from "./support/review-fixture.mjs";

const request = { schemaVersion: 1 };
describe("모델 설정은 설치·계정 없이 동작한다", () => {
  it("미설치 상태에서 모델을 저장하고 이전 테스트 표시를 무효화한다", async () => {
    await mkdir(".artifacts/models", { recursive: true });
    await $("button=AI 연결 설정").click();
    await $("#default-model").waitForEnabled();
    await $("button=상태 다시 확인").click();
    await browser.waitUntil(async () =>
      (await $('[data-testid="connection-status"]').getText()).includes(
        "찾을 수 없습니다",
      ),
    );
    await selectModel("opus");
    await $("button=모델 설정 저장").click();
    await browser.waitUntil(async () =>
      (await $(".model-settings [role=status]").getText()).includes(
        "저장했습니다",
      ),
    );
    assert.equal(
      await invoke("model_settings_command", {
        request: { ...request, action: { kind: "read" } },
      }),
      "opus",
    );
    await writeFile(join(root, "next-connection"), "READY");
    await $("button=상태 다시 확인").click();
    await $("button=상태 다시 확인").waitForEnabled();
    await $(".connection-diagnostics > summary").click();
    await writeFile(join(root, "expected-model"), "opus");
    await writeFile(join(root, "next-generation"), "EXPLAIN");
    await $("button=연결 테스트").click();
    await browser.waitUntil(async () =>
      (await $('[data-testid="connection-status"]').getText()).includes(
        "테스트를 완료",
      ),
    );
    await selectModel("haiku");
    assert.equal(await $("button=연결 테스트").isEnabled(), false);
    assert.doesNotMatch(
      await $('[data-testid="connection-status"]').getText(),
      /테스트를 완료/,
    );
    await selectModel("opus");
    await $(".connection-diagnostics > summary").click();
  });

  it("저장·읽기 실패 후 선택과 기존 파일을 보존하고 수동 복구한다", async () => {
    const path = join(root, "data", "model-settings.json");
    const original = await readFile(path, "utf8");
    await writeFile(path, "broken-settings");
    try {
      await selectModel("haiku");
      // Embedded WDIO dispatches synthetic keys; native Tab is checked separately.
      assert.equal(
        await browser.execute(() => {
          const button = document.querySelector(".model-settings button");
          button.focus();
          return document.activeElement === button && button.tabIndex === 0;
        }),
        true,
      );
      await $("button=모델 설정 저장").click();
      await $(".model-settings [role=alert]").waitForDisplayed();
      assert.equal(await $("#default-model").getValue(), "haiku");
      assert.equal(await readFile(path, "utf8"), "broken-settings");
      await browser.saveScreenshot(".artifacts/models/settings-error.png");
      await $("button=설정 닫기").click();
      await $("button=AI 연결 설정").click();
      await $("button=모델 설정 다시 읽기").waitForDisplayed();
      assert.equal(await $("button=모델 설정 저장").isEnabled(), false);
    } finally {
      await writeFile(path, original);
    }
    await $("button=모델 설정 다시 읽기").click();
    await $("#default-model").waitForEnabled();
    assert.equal(await $("#default-model").getValue(), "opus");
  });

  it("실제 화면에서 작은 창과 확대에도 설정 조작이 보인다", async () => {
    await mkdir(".artifacts/models", { recursive: true });
    for (const [width, height] of [
      [1440, 900],
      [800, 600],
    ]) {
      await browser.setWindowSize(width, height);
      for (const scale of [1, 1.5, 2]) {
        await browser.execute(async (scale) => {
          await globalThis.__TAURI__.webview.getCurrentWebview().setZoom(scale);
        }, scale);
        await $("#default-model").scrollIntoView();
        const bounds = await browser.execute(() => {
          const dialog = document.querySelector(".connection-dialog");
          const select = document
            .querySelector("#default-model")
            .getBoundingClientRect();
          return {
            overflow: dialog.scrollWidth > dialog.clientWidth + 1,
            visible:
              select.left >= 0 &&
              select.right <= innerWidth &&
              select.top >= 0 &&
              select.bottom <= innerHeight,
          };
        });
        assert.equal(bounds.overflow, false);
        assert.equal(bounds.visible, true);
        await browser.saveScreenshot(
          `.artifacts/models/settings-${width}-${scale}.png`,
        );
      }
    }
    await browser.execute(async () => {
      await globalThis.__TAURI__.webview.getCurrentWebview().setZoom(1);
    });
    await browser.setWindowSize(1440, 900);
    await $("button=설정 닫기").scrollIntoView();
    await $("button=설정 닫기").click();
    await browser.waitUntil(
      async () =>
        (await browser.execute(() => document.activeElement.textContent)) ===
        "문서 목록",
    );
  });
});

async function selectModel(value) {
  await browser.execute((value) => {
    const select = document.querySelector("#default-model");
    select.focus();
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await browser.waitUntil(
    async () => (await $("#default-model").getValue()) === value,
  );
}
