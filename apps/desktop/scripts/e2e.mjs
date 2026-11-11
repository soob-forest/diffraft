import { execFileSync, spawn } from "node:child_process";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareKeyboard } from "./e2e-keyboard.mjs";
import { assertE2EBuild } from "./e2e-preflight.mjs";
import { prepare, prepareStartupFailure } from "./e2e-workspace.mjs";
import { prepareUxNativeApp } from "./ux-native-app.mjs";
import { saveVerificationFixture } from "./verification-fixture.mjs";

const app = fileURLToPath(new URL("../", import.meta.url));
const QUIT_STRESS_RUNS = 24;
const nativeQuitHelper = join(app, ".artifacts/native-quit");
await assertE2EBuild();
if (
  process.argv[2] &&
  ![
    "workspace-followup",
    "workspace-panels",
    "request-followup",
    "request-workflow",
    "model-selection",
    "codex",
    "codex-native",
    "codex-keyboard",
    "codex-stale",
    "codex-recovery",
    "tobe",
    "design",
    "design-resume",
    "usability",
    "ux",
    "ux-extensions",
    "ux-local",
    "ux-recovery",
    "ux-reliability",
    "selection-popover",
    "selection-transitions",
    "source-lifecycle",
    "ux-native",
    "review",
    "patch-groups",
    "recovery",
    "connection",
    "generation",
    "conflict",
    "layout",
    "regeneration",
    "history",
    "rewrite",
    "rewrite-review",
    "rewrite-review-keyboard",
    "review-followup",
    "rewrite-cancel",
    "navigation",
    "export",
    "shutdown",
    "quit",
    "performance",
    "startup-failure",
  ].includes(process.argv[2])
)
  throw new Error(
    "지원하는 선택 실행은 usability, connection, generation, review, recovery, conflict, layout, regeneration, history, rewrite, rewrite-cancel, navigation, export, shutdown, performance, startup-failure입니다.",
  );
const workspacePanels = ["workspace-panels", "workspace-panels-restart"];
const workspaceFollowup = ["workspace-followup", "workspace-followup-restart"];
const patchGroups = ["patch-groups", "patch-groups-restart"];
const review = ["review", ...patchGroups];
const regeneration = ["regeneration", "regeneration-restart"];
const generation = ["generation", "generation-restart"];
const exportPhases = ["export", "export-restart"];
const shutdown = ["shutdown", "shutdown-restart"];
const navigation = ["navigation", "navigation-restart"];
const recovery = ["recovery", "recovery-restart"];
const selectionTransitions = [
  "selection-transitions",
  "selection-transitions-restart",
];
const unitReview = ["rewrite-review", "rewrite-review-restart"];
let scenarios =
  process.argv[2] === "patch-groups"
    ? [patchGroups]
    : process.argv[2] === "request-workflow"
      ? [["request-workflow", "request-workflow-restart"]]
      : process.argv[2] === "rewrite-review"
        ? [unitReview]
        : process.argv[2]
          ? [
              process.argv[2] === "ux"
                ? [
                    "ux",
                    "ux-restart",
                    "ux-extensions",
                    "ux-local",
                    "ux-recovery",
                  ]
                : process.argv[2] === "selection-popover"
                  ? [
                      "selection-popover",
                      "selection-popover-layout",
                      "selection-popover-restart",
                    ]
                  : process.argv[2] === "selection-transitions"
                    ? selectionTransitions
                    : process.argv[2] === "ux-reliability"
                      ? ["ux-reliability", "ux-reliability-restart"]
                      : process.argv[2] === "quit"
                        ? Array.from({ length: QUIT_STRESS_RUNS }, () => "quit")
                        : process.argv[2] === "codex-native"
                          ? ["codex-native", "codex-restart"]
                          : process.argv[2] === "codex"
                            ? [
                                "codex",
                                "codex-restart",
                                "codex-stale",
                                "codex-recovery",
                              ]
                            : process.argv[2] === "model-selection"
                              ? ["model-selection", "model-selection-restart"]
                              : process.argv[2] === "design-resume"
                                ? ["design-resume", "design-resume-restart"]
                                : process.argv[2] === "regeneration"
                                  ? regeneration
                                  : process.argv[2] === "generation"
                                    ? generation
                                    : process.argv[2] === "export"
                                      ? exportPhases
                                      : process.argv[2] === "shutdown"
                                        ? shutdown
                                        : process.argv[2] === "navigation"
                                          ? navigation
                                          : process.argv[2] === "recovery"
                                            ? recovery
                                            : process.argv[2] === "review"
                                              ? review
                                              : [process.argv[2]],
            ]
          : [
              workspaceFollowup,
              workspacePanels,
              ["request-followup"],
              ["request-workflow", "request-workflow-restart"],
              ["editor", "restart"],
              ["connection"],
              ["model-selection", "model-selection-restart"],
              ["codex", "codex-restart", "codex-stale", "codex-recovery"],
              generation,
              ["design"],
              ["tobe"],
              ["design-resume", "design-resume-restart"],
              ["usability"],
              ["ux", "ux-restart", "ux-extensions", "ux-local", "ux-recovery"],
              ["ux-reliability", "ux-reliability-restart"],
              [
                "selection-popover",
                "selection-popover-layout",
                "selection-popover-restart",
              ],
              review,
              selectionTransitions,
              ["source-lifecycle"],
              recovery,
              ["conflict"],
              ["layout"],
              regeneration,
              ["history"],
              ["rewrite"],
              unitReview,
              ["review-followup"],
              ["rewrite-cancel"],
              navigation,
              exportPhases,
              shutdown,
              ["performance"],
              ["startup-failure"],
            ];
if (process.argv[2] === "workspace-panels") scenarios = [workspacePanels];
if (process.argv[2] === "workspace-followup") scenarios = [workspaceFollowup];
if (process.argv[2] === "quit") await prepareNativeQuit();
if (process.argv[2] === "ux-native") await prepareUxNativeApp(app);
await prepareKeyboard(scenarios, app);
for (const phases of scenarios) {
  const root = await mkdtemp(join(tmpdir(), "docreview-e2e-"));
  try {
    await prepare(root);
    if (phases[0] === "codex-native")
      await writeFile(
        join(root, "use-real-codex"),
        "explicit synthetic account verification",
      );
    await prepareStartupFailure(root, phases[0]);
    for (const [iteration, phase] of phases.entries()) {
      const code = await run(phase, root, iteration);
      if (phase === "selection-popover" && code === 0)
        await saveVerificationFixture(app, root);
      if (phase === "quit" && code === 0) await recordQuit(root, iteration);
      if (code !== 0) {
        process.exitCode = code;
        break;
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  if (process.exitCode) break;
}

function run(phase, root, iteration) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [join(app, "node_modules/@wdio/cli/bin/wdio.js"), "run", "wdio.conf.mjs"],
      {
        cwd: app,
        stdio: "inherit",
        shell: false,
        env: {
          ...process.env,
          DOCREVIEW_E2E_DATA: root,
          DOCREVIEW_E2E_PHASE: phase,
          DOCREVIEW_QUIT_CASE: String(iteration),
          DOCREVIEW_NATIVE_QUIT_HELPER: nativeQuitHelper,
        },
      },
    );
    child.on("error", () => {
      console.error("E2E 실행기를 시작할 수 없습니다.");
      resolve(1);
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function prepareNativeQuit() {
  await mkdir(join(app, ".artifacts"), { recursive: true });
  execFileSync(
    "/usr/bin/swiftc",
    [join(app, "scripts/native-quit.swift"), "-o", nativeQuitHelper],
    { stdio: "inherit" },
  );
  await writeFile(join(app, ".artifacts/quit-stress.jsonl"), "");
}

async function recordQuit(root, iteration) {
  const state = JSON.parse(
    await readFile(join(root, "shutdown-lifecycle.json"), "utf8"),
  );
  const result = JSON.parse(
    await readFile(join(root, `exit-${state.pid}.json`), "utf8"),
  );
  await appendFile(
    join(app, ".artifacts/quit-stress.jsonl"),
    `${JSON.stringify({ iteration, ...state, ...result })}\n`,
  );
}
