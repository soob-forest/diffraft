import { fileURLToPath } from "node:url";

const testRoot = process.env.DOCREVIEW_E2E_DATA;
const phase = process.env.DOCREVIEW_E2E_PHASE;
if (
  !testRoot ||
  ![
    "model-selection",
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
  new URL("./src-tauri/target/debug/docreview", import.meta.url),
);
const TEST_TIMEOUT_MS = 30_000;

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
}
