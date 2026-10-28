import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const app = new URL(
  "../src-tauri/target/release/bundle/macos/DocReview.app/",
  import.meta.url,
);
const executable = new URL("Contents/MacOS/docreview", app);
assert.deepEqual(
  (await readdir(new URL("Contents/MacOS/", app))).sort(),
  ["docreview"],
  "배포 앱에는 제품 실행 파일 하나만 포함해야 합니다.",
);
const plist = JSON.parse(
  execFileSync(
    "/usr/bin/plutil",
    [
      "-convert",
      "json",
      "-o",
      "-",
      fileURLToPath(new URL("Contents/Info.plist", app)),
    ],
    { encoding: "utf8" },
  ),
);
assert.equal(plist.CFBundleIdentifier, "local.diffraft.docreview");
assert.equal(plist.CFBundleShortVersionString, "0.1.0");
assert.equal(plist.LSMinimumSystemVersion, "14.0");
execFileSync(
  "/usr/bin/codesign",
  ["--verify", "--deep", "--strict", fileURLToPath(app)],
  { stdio: "pipe" },
);
const binary = await readFile(executable);
const prohibited = [
  "e2e_process_id",
  "e2e_request_exit",
  "e2e_request_native_exit",
  "docreview_request_native_exit",
  "e2e_register_ai",
  "DOCREVIEW_E2E_DATA",
  "tauri_plugin_wdio",
  "export_testing",
];
for (const marker of prohibited)
  assert.equal(
    binary.includes(Buffer.from(marker)),
    false,
    `제품에 테스트 코드가 포함됐습니다: ${marker}`,
  );
const architecture = execFileSync(
  "/usr/bin/lipo",
  ["-archs", fileURLToPath(executable)],
  { encoding: "utf8" },
).trim();
assert.equal(architecture, "arm64");
console.log(
  JSON.stringify({
    event: "internal_bundle_verified",
    executables: 1,
    architecture,
    testMarkers: 0,
    signatureValid: true,
  }),
);
