import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";

export function observeExit(child, root) {
  const local = relative(tmpdir(), root);
  assert(
    isAbsolute(root) && local && !local.startsWith("..") && !isAbsolute(local),
  );
  assert(
    Number.isSafeInteger(child.pid) && child.pid > 0,
    "앱 자식 PID가 필요합니다.",
  );
  const record = (code, signal) => {
    writeFileSync(
      join(root, `exit-${child.pid}.json`),
      JSON.stringify({ pid: child.pid, code, signal }),
      { mode: 0o600 },
    );
  };
  if (child.exitCode !== null || child.signalCode !== null) {
    record(child.exitCode, child.signalCode);
  } else {
    child.once("exit", record);
  }
}

export function assertNormalExit(result) {
  assert(
    result && Number.isSafeInteger(result.pid) && result.pid > 0,
    "앱 종료 결과가 없습니다.",
  );
  assert(
    result.code === 0 && result.signal === null,
    `앱 정상 종료 실패: ${JSON.stringify(result)}`,
  );
}
