import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export async function prepareKeyboard(scenarios, app) {
  if (
    scenarios.some(
      (phases) =>
        phases.includes("codex-keyboard") ||
        phases.includes("request-workflow") ||
        phases.includes("request-followup") ||
        phases.includes("selection-popover") ||
        phases.includes("ux-reliability") ||
        phases.includes("review") ||
        phases.includes("usability") ||
        phases.includes("patch-groups") ||
        phases.includes("rewrite-review") ||
        phases.includes("ux-local") ||
        phases.includes("review-followup") ||
        phases.includes("rewrite-review-keyboard"),
    )
  ) {
    await mkdir(join(app, ".artifacts"), { recursive: true });
    execFileSync(
      "/usr/bin/swiftc",
      [
        join(app, "scripts/native-keyboard.swift"),
        "-o",
        join(app, ".artifacts/native-keyboard"),
      ],
      { stdio: "inherit" },
    );
  }
}
