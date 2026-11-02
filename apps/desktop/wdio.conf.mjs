import { fileURLToPath } from "node:url";
import { assertE2EBuild, assertOwnedRoot } from "./scripts/e2e-preflight.mjs";

const testRoot = process.env.DOCREVIEW_E2E_DATA;
const phase = process.env.DOCREVIEW_E2E_PHASE;
if (
  !testRoot ||
  ![
    "model-selection",
    "codex",
    "codex-restart",
    "codex-native",
    "codex-keyboard",
    "codex-stale",
    "codex-recovery",
    "model-selection-restart",
    "tobe",
    "editor",
    "connection",
    "generation",
    "generation-restart",
    "restart",
    "design",
    "design-resume",
    "design-resume-restart",
    "usability",
    "ux",
    "ux-restart",
    "ux-extensions",
    "ux-local",
    "ux-recovery",
    "ux-reliability",
    "ux-reliability-restart",
    "selection-popover",
    "selection-popover-layout",
    "selection-popover-restart",
    "selection-transitions",
    "selection-transitions-restart",
    "source-lifecycle",
    "ux-native",
    "review",
    "recovery",
    "recovery-restart",
    "conflict",
    "layout",
    "history",
    "rewrite",
    "rewrite-cancel",
    "navigation",
    "navigation-restart",
    "export",
    "export-restart",
    "shutdown",
    "quit",
    "shutdown-restart",
    "performance",
    "startup-failure",
    "regeneration",
    "regeneration-restart",
  ].includes(phase)
)
  throw new Error("npm run test:e2e로 실행해 주세요.");

const application = fileURLToPath(
  new URL(
    phase === "ux-native"
      ? "./.artifacts/ux-native/DocReview UX.app/Contents/MacOS/docreview"
      : "./src-tauri/target/debug/docreview",
    import.meta.url,
  ),
);
const TEST_TIMEOUT_MS =
  phase === "ux-native"
    ? 650_000
    : phase === "codex-native"
      ? 120_000
      : phase === "ux-recovery"
        ? 75_000
        : 30_000;
await assertE2EBuild(application);
await assertOwnedRoot(testRoot);

export const config = {
  runner: "local",
  specs:
    phase === "editor"
      ? [["./tests/shell.e2e.mjs", "./tests/editor.e2e.mjs"]]
      : phase === "restart"
        ? ["./tests/restart.e2e.mjs"]
        : [`./tests/${phase}.e2e.mjs`],
  maxInstances: 1,
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  waitforTimeout: 10_000,
  connectionRetryTimeout: TEST_TIMEOUT_MS,
  connectionRetryCount: 0,
  mochaOpts: {
    timeout: TEST_TIMEOUT_MS,
    rootHooks: { beforeAll: ensureVisibleWindow },
  },
  services: [
    [
      fileURLToPath(
        new URL("./scripts/tauri-exit-service.mjs", import.meta.url),
      ),
      {
        appBinaryPath: application,
        driverProvider: "embedded",
        captureBackendLogs: false,
        captureFrontendLogs: false,
        env: { DOCREVIEW_E2E_DATA: testRoot },
      },
    ],
  ],
  capabilities: [{ browserName: "tauri", "tauri:options": { application } }],
};

async function ensureVisibleWindow() {
  await browser.waitUntil(
    async () =>
      browser.execute(async () => {
        const window = globalThis.__TAURI__.window.getCurrentWindow();
        await window.unminimize();
        await window.show();
        await window.setFocus();
        return document.visibilityState === "visible";
      }),
    { timeoutMsg: "테스트 창이 표시되어야 화면 배치를 검증할 수 있습니다." },
  );
  if (!phase.startsWith("codex") && phase !== "startup-failure") {
    await browser.execute(async () => {
      await globalThis.__TAURI__.core.invoke("ai_settings_command", {
        request: {
          schemaVersion: 1,
          action: { kind: "provider", provider: "claude" },
        },
      });
    });
  }
}
