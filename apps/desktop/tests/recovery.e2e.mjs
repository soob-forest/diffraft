import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, invoke, prepare, root } from "./support/review-fixture.mjs";

function database(sql) {
  return execFileSync("/usr/bin/sqlite3", [
    join(root, "data/workspace.sqlite3"),
    sql,
  ]);
}

describe("승인 저장 실패 뒤 복구 상태 보호", () => {
  it("파일 교체 뒤 DB 실패에도 재열기와 취소 요청이 복구 상태를 깨뜨리지 않는다", async () => {
    const fixture = await prepare("review");
    const documentId = fixture.document.id;
    database(
      "CREATE TRIGGER e2e_fail_approval BEFORE INSERT ON versions WHEN NEW.reason='accept' BEGIN SELECT RAISE(ABORT,'injected approval commit failure'); END;",
    );
    try {
      await $("button=선택한 변경 승인").click();
      await browser.waitUntil(async () =>
        (await $(".review-panel > .review-message").getText()).includes(
          "저장할 수 없습니다",
        ),
      );
      assert.equal(
        (await editor({ kind: "read", documentId })).document.status,
        "RECOVERY_REQUIRED",
      );
      assert.notEqual(
        await readFile(join(root, "review.md"), "utf8"),
        fixture.base,
      );
      await reopen();
      assert.equal(
        (await editor({ kind: "read", documentId })).document.status,
        "RECOVERY_REQUIRED",
      );
      assert.equal(await tryDiscard(fixture), "FILE_CONFLICT");
      await $("button=파일 비교·복구").click();
      await $("button=저장 복구 실행").waitForDisplayed();
      await $("button=닫기").click();
      await writeFile(
        join(root, "recovery-expected.json"),
        JSON.stringify({
          documentId,
          batchId: fixture.batch.id,
          processId: await invoke("e2e_process_id", {}),
          content: await readFile(join(root, "review.md"), "utf8"),
        }),
      );
    } finally {
      database("DROP TRIGGER IF EXISTS e2e_fail_approval;");
    }
  });
});

async function reopen() {
  const selection = join(root, "next-pick");
  await writeFile(selection, "review");
  await $("button=문서 열기").click();
  await browser.waitUntil(async () => {
    try {
      await access(selection);
      return false;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return $("button=문서 열기").isEnabled();
    }
  });
}

async function tryDiscard(fixture) {
  return browser.execute(
    async (request) => {
      try {
        await window.__TAURI__.core.invoke("review_command", {
          request: {
            schemaVersion: 1,
            action: { kind: "batch_decision", decision: "discard", request },
          },
        });
        return "UNEXPECTED_SUCCESS";
      } catch (error) {
        return error.code;
      }
    },
    {
      documentId: fixture.document.id,
      batchId: fixture.batch.id,
      expectedHeadId: fixture.batch.applyHeadId,
      operationId: crypto.randomUUID(),
    },
  );
}
