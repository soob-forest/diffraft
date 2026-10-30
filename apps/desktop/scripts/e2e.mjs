import { execFileSync, spawn } from "node:child_process";
import {
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { layoutSource } from "../tests/fixtures/layout.mjs";

const app = fileURLToPath(new URL("../", import.meta.url));
const QUIT_STRESS_RUNS = 24;
const nativeQuitHelper = join(app, ".artifacts/native-quit");
if (
  process.argv[2] &&
  ![
    "model-selection",
    "tobe",
    "design",
    "design-resume",
    "usability",
    "review",
    "recovery",
    "connection",
    "generation",
    "conflict",
    "layout",
    "regeneration",
    "history",
    "rewrite",
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
const regeneration = ["regeneration", "regeneration-restart"];
const generation = ["generation", "generation-restart"];
const exportPhases = ["export", "export-restart"];
const shutdown = ["shutdown", "shutdown-restart"];
const navigation = ["navigation", "navigation-restart"];
const recovery = ["recovery", "recovery-restart"];
const scenarios = process.argv[2]
  ? [
      process.argv[2] === "quit"
        ? Array.from({ length: QUIT_STRESS_RUNS }, () => "quit")
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
                        : [process.argv[2]],
    ]
  : [
      ["editor", "restart"],
      ["connection"],
      ["model-selection", "model-selection-restart"],
      generation,
      ["design"],
      ["tobe"],
      ["design-resume", "design-resume-restart"],
      ["usability"],
      ["review"],
      recovery,
      ["conflict"],
      ["layout"],
      regeneration,
      ["history"],
      ["rewrite"],
      ["rewrite-cancel"],
      navigation,
      exportPhases,
      shutdown,
      ["performance"],
      ["startup-failure"],
    ];
if (process.argv[2] === "quit") await prepareNativeQuit();
for (const phases of scenarios) {
  const root = await mkdtemp(join(tmpdir(), "docreview-e2e-"));
  try {
    await prepare(root);
    await prepareStartupFailure(root, phases[0]);
    for (const [iteration, phase] of phases.entries()) {
      const code = await run(phase, root, iteration);
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

async function prepareStartupFailure(root, phase) {
  if (phase !== "startup-failure") return;
  await mkdir(join(root, "data"));
  const path = join(root, "data/workspace.sqlite3");
  execFileSync("/usr/bin/sqlite3", [
    path,
    "PRAGMA user_version=999; CREATE TABLE preserve(value TEXT); INSERT INTO preserve VALUES('fixture');",
  ]);
  await writeFile(join(root, "expected-database"), await readFile(path));
}

async function prepare(root) {
  await writeFile(join(root, "layout.md"), layoutSource);
  const performanceBytes = 50 * 1024;
  const paragraph = `${"성능 검사를 위한 원문 문단입니다. ".repeat(8)}\n\n`;
  const performanceSource = `# 성능 문서\n\n${paragraph.repeat(Math.floor((performanceBytes - 100) / Buffer.byteLength(paragraph)))}`;
  await writeFile(
    join(root, "performance.md"),
    performanceSource +
      " ".repeat(performanceBytes - Buffer.byteLength(performanceSource)),
  );
  const base = await readFile(
    new URL("../../../docs/examples/base_v12.md", import.meta.url),
    "utf8",
  );
  await writeFile(join(root, "review.md"), base);
  await writeFile(
    join(root, "rewrite.md"),
    await readFile(
      new URL("../../../docs/examples/confirmed_v14.md", import.meta.url),
      "utf8",
    ),
  );
  await writeFile(join(root, "bulk-review.md"), base);
  await writeFile(join(root, "regeneration.md"), base);
  await writeFile(join(root, "regeneration-late.md"), base);
  await writeFile(join(root, "conflict-review.md"), base);
  await writeFile(
    join(root, "document.md"),
    "\ufeff# 로컬 문서\r\n\r\n한글 😀 원문\r\n",
  );
  await writeFile(join(root, "readonly.md"), "# 읽기 전용\n원문 유지\n");
  await chmod(join(root, "readonly.md"), 0o444);
  const limit = 1024 * 1024;
  const unit = "한글과 emoji 😀 · 문단 검증\n\n";
  const content = `# 큰 문서\n${unit.repeat(Math.floor((limit - 100) / Buffer.byteLength(unit)))}`;
  await writeFile(
    join(root, "large.md"),
    `${content}${" ".repeat(limit - Buffer.byteLength(content))}`,
  );
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
