import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { invoke, root } from "./support/review-fixture.mjs";

const directory = join(
  root,
  "data/codex-work/00000000-0000-4000-8000-000000000099",
);
const settings = (action) =>
  invoke("ai_settings_command", { request: { schemaVersion: 1, action } });
describe("연결 테스트의 늦은 성공 응답", () => {
  it("검사 중 설정이 바뀌면 이전 테스트를 성공으로 표시하지 않는다", async () => {
    await $("button=AI 연결 설정").click();
    await $("#codex-model").waitForEnabled();
    await $("button=상태·모델 목록 조회").click();
    await $("button=상태·모델 목록 조회").waitForEnabled();
    await rm(join(directory, "codex-generation-ready"), { force: true });
    await rm(join(directory, "codex-release"), { force: true });
    await writeFile(join(root, "next-codex-connection"), "HANG");
    await $("button=연결 테스트").click();
    await browser.waitUntil(async () => {
      try {
        return (
          (await readFile(
            join(directory, "codex-generation-ready"),
            "utf8",
          )) === "ready"
        );
      } catch {
        return false;
      }
    });
    try {
      await settings({ kind: "provider", provider: "claude" });
      await writeFile(join(directory, "codex-release"), "release");
      await $(".connection-dialog [role=alert]").waitForDisplayed();
      assert.match(
        await $(".connection-dialog [role=alert]").getText(),
        /설정이 변경/,
      );
      assert.doesNotMatch(
        await $('[data-testid="connection-status"]').getText(),
        /연결 테스트 완료/,
      );
    } finally {
      await settings({ kind: "provider", provider: "codex" });
      await rm(join(directory, "codex-release"), { force: true });
      await writeFile(join(root, "next-codex-connection"), "SUCCESS");
    }
    await $("button=설정 닫기").click();
  });
});
