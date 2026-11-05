import assert from "node:assert/strict";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  confirmed,
  prepareRewrite,
  requestRewrite,
  root,
  start,
  waitCandidate,
} from "./rewrite-fixture.mjs";
import { foregroundUnitDisplay } from "./unit-review-display.mjs";
import {
  chooseUnit,
  current,
  invoke,
  setUnitFilter,
} from "./unit-review-fixture.mjs";
import {
  activeKeyboardFocus,
  installNativeKeyTrace,
  readNativeKeyTrace,
} from "./unit-review-key-events.mjs";

export const keyboardDocuments = [
  "rewrite",
  "review",
  "bulk-review",
  "regeneration",
  "regeneration-late",
  "conflict-review",
  "layout",
  "performance",
];

export async function prepareKeyboardReview(name) {
  assert(
    keyboardDocuments.includes(name),
    "허용된 합성 문서를 사용해야 합니다.",
  );
  await prepareKeyboardWindow(name);
  await keyboardSetupStage(name, "prepare-document-and-task");
  const fixture = await prepareRewrite(name);
  await keyboardSetupStage(name, "request-confirmation");
  await requestRewrite();
  await keyboardSetupStage(name, "start-generation");
  await start("REWRITE_UNITS");
  await keyboardSetupStage(name, "wait-candidate");
  fixture.batch = await waitCandidate(fixture.task.id, 1);
  await keyboardSetupStage(name, "start-unit-review");
  await $("button=변경별 검토 시작").waitForEnabled();
  await $("button=변경별 검토 시작").click();
  await $(".unit-review").waitForDisplayed();
  return finishKeyboardSetup(fixture, name);
}

async function prepareKeyboardWindow(name) {
  await keyboardSetupStage(name, "write-synthetic-source");
  await writeFile(join(root, `${name}.md`), confirmed);
  await keyboardSetupStage(name, "resize-window");
  await browser.setWindowSize(1440, 900);
  await keyboardSetupStage(name, "foreground-and-visibility");
  await foregroundUnitDisplay(1);
  await keyboardSetupStage(name, "open-sidebar");
  if (!(await $(".sidebar").isDisplayed())) await $("button=문서 목록").click();
}

async function finishKeyboardSetup(fixture, name) {
  await keyboardSetupStage(name, "current-projection");
  fixture.batch = (await current(fixture)).batch;
  await keyboardSetupStage(name, "filter-pending");
  await setUnitFilter("pending");
  await keyboardSetupStage(name, "choose-first-unit");
  await chooseUnit(fixture.batch.reviewUnits[0].id);
  await keyboardSetupStage(name, "install-native-key-trace");
  await installNativeKeyTrace();
  await keyboardSetupStage(name, "read-process-id");
  const pid = await invoke("e2e_process_id", {});
  await keyboardSetupStage(name, "ready");
  return { ...fixture, name, pid };
}

async function keyboardSetupStage(name, stage) {
  const directory = ".artifacts/unit-review/after";
  await mkdir(directory, { recursive: true });
  await appendFile(
    `${directory}/keyboard-setup-${name}.jsonl`,
    `${JSON.stringify({ document: name, stage, at: new Date().toISOString(), synthetic: true })}\n`,
  );
}

export async function recordKeyboardEvidence(fixture, outcome, scenario) {
  if (!fixture) return;
  const directory = ".artifacts/unit-review/after";
  await mkdir(directory, { recursive: true });
  await writeFile(
    `${directory}/keyboard-${fixture.name}.json`,
    JSON.stringify(
      {
        outcome,
        scenario,
        nativeEvents: await readNativeKeyTrace(),
        focus: await activeKeyboardFocus(),
        realIme: "not-tested",
        voiceOver: "not-tested",
        compositionCoverage: scenario.includes("합성")
          ? "synthetic guard only; not actual Korean IME"
          : "not exercised in this scenario",
      },
      null,
      2,
    ),
  );
  await browser.saveScreenshot(`${directory}/keyboard-${fixture.name}.png`);
}
