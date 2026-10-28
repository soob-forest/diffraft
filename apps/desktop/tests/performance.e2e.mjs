import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  beginRequest,
  createTask,
  terminal,
} from "./support/generation-fixture.mjs";
import { root } from "./support/review-fixture.mjs";
import { measureClick, writePerformance } from "./support/ui-timing.mjs";

describe("50 KiB 문서 반응 시간", () => {
  it("실제 projection과 승인 완료 UI를 각각 300 ms 이내에 표시한다", async () => {
    const path = join(root, "performance.md");
    const before = await readFile(path, "utf8");
    assert.equal(Buffer.byteLength(before), 50 * 1024);
    await writeFile(join(root, "next-pick"), "performance");
    await $("button=문서 열기").click();
    await $('[data-testid="source-editor"]').waitForDisplayed();
    const taskId = await createTask("성능 검사");
    await beginRequest("PATCH", "PATCH_SCOPE", "첫 문장만 바꾸세요.");
    assert.equal((await terminal(taskId)).lastAttempt.status, "SUCCEEDED");
    await $('[data-testid="diff-stats"]').waitForDisplayed();
    await $("button=원문").click();
    const diffMs = await measureClick(
      "변경 검토",
      '[data-testid="diff-stats"]',
      "+1 / −2",
    );
    const approvalMs = await measureClick(
      "선택한 변경 승인",
      ".version-badge",
      "v2",
    );
    assert.equal(
      await readFile(path, "utf8"),
      before.replace("# 성능 문서\n", "검토 후 승인할 새 원문"),
    );
    await mkdir(".artifacts", { recursive: true });
    await writePerformance({
      bytes: Buffer.byteLength(before),
      diffMs,
      approvalMs,
    });
    assert.ok(diffMs < 300, `diff ${Math.round(diffMs)} ms`);
    assert.ok(approvalMs < 300, `승인 ${Math.round(approvalMs)} ms`);
  });
});
