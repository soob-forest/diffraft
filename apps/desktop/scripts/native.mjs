import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const app = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2];
const tasks = {
  test: ["test", "--locked", "--features", "test-support"],
  check: [
    "clippy",
    "--locked",
    "--all-targets",
    "--features",
    "test-support",
    "--",
    "-D",
    "warnings",
  ],
  fmt: ["fmt", "--all", "--", "--check"],
  contracts: [
    "run",
    "--no-default-features",
    "--features",
    "contract-export",
    "--bin",
    "export-contracts",
  ],
  "contracts-check": [
    "run",
    "--locked",
    "--no-default-features",
    "--features",
    "contract-export",
    "--bin",
    "export-contracts",
    "--",
    "--check",
  ],
};
const internal = mode === "bundle-internal";
const building = internal || mode === "build" || mode === "build-e2e";
if (!building && !Object.hasOwn(tasks, mode))
  throw new Error("UNKNOWN_NATIVE_TASK");
const e2e = mode === "build-e2e";
const env = {
  ...process.env,
  CARGO_HOME: resolve(root, ".tools/cargo"),
  RUSTUP_HOME: resolve(root, ".tools/rustup"),
  CLIPPY_CONF_DIR: resolve(app, "src-tauri"),
  PATH: `${resolve(root, ".tools/node-v24.22.1-darwin-arm64/bin")}:${resolve(root, ".tools/cargo/bin")}:${process.env.PATH}`,
  VITE_DOCREVIEW_E2E: String(e2e),
};
const buildArgs = [
  resolve(app, "node_modules/@tauri-apps/cli/tauri.js"),
  "build",
];
if (internal) {
  for (const key of Object.keys(env)) {
    if (key.startsWith("APPLE_")) delete env[key];
  }
  buildArgs.push("--ci", "--config", "src-tauri/tauri.internal.conf.json");
} else buildArgs.push("--debug", "--no-bundle");
if (e2e)
  buildArgs.push(
    "--features",
    "e2e",
    "--config",
    "src-tauri/tauri.e2e.conf.json",
  );
const child = spawn(
  building ? process.execPath : resolve(root, ".tools/cargo/bin/cargo"),
  building ? buildArgs : tasks[mode],
  {
    cwd: building ? app : resolve(app, "src-tauri"),
    env,
    stdio: "inherit",
    shell: false,
  },
);
child.on("error", () => {
  console.error(
    "프로젝트의 Node/Rust 도구를 시작할 수 없습니다. README 설치 절차를 확인하세요.",
  );
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
