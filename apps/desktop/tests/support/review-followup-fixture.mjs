import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  confirmed,
  prepareRewrite,
  requestRewrite,
  root,
  start,
  waitCandidate,
} from "./rewrite-fixture.mjs";
import {
  foregroundUnitDisplay,
  settleUnitDisplay,
} from "./unit-review-display.mjs";
import {
  closeUnitMenu,
  current,
  openUnitMenu,
} from "./unit-review-fixture.mjs";

export const followupDirectory = ".artifacts/unit-review/after";
export const activeFollowup = ".unit-diff-body:not([hidden])";
const extraLines = 80;

export function followupSource() {
  const heading = "## 2. 확인 시간";
  assert.equal(confirmed.split(heading).length, 2);
  const context = Array.from(
    { length: extraLines },
    (_, index) => `합성 검토 문맥 ${index + 1}: 삭제할 원문 행입니다.`,
  ).join("\n");
  return confirmed.replace(heading, `${context}\n\n${heading}`);
}

export async function prepareFollowupReview(name) {
  assert(
    ["rewrite", "review", "bulk-review", "conflict-review"].includes(name),
  );
  await browser.setWindowSize(1440, 900);
  await foregroundUnitDisplay(1);
  if (!(await $(".sidebar").isDisplayed())) await $("button=문서 목록").click();
  const source = followupSource();
  await writeFile(join(root, `${name}.md`), source);
  const fixture = await prepareRewrite(name, source);
  await requestRewrite();
  await start("REWRITE_UNITS");
  fixture.batch = await waitCandidate(fixture.task.id, 1);
  await $("button=변경별 검토 시작").waitForEnabled();
  await $("button=변경별 검토 시작").click();
  await $(".unit-review").waitForDisplayed();
  fixture.batch = (await current(fixture)).batch;
  assert.equal(fixture.batch.mode, "REWRITE");
  assert.equal(fixture.batch.reviewMode, "CHANGES");
  assert(fixture.batch.reviewUnits.length >= 3, "여러 독립 단위가 필요합니다.");
  await closeFollowupDetail();
  await settleUnitDisplay();
  return { ...fixture, source, name };
}

export async function closeFollowupDetail() {
  if (await $("button=본문으로 돌아가기").isDisplayed())
    await $("button=본문으로 돌아가기").click();
  else if (await $("button=요청·상세 접기").isDisplayed())
    await $("button=요청·상세 접기").click();
  await settleUnitDisplay();
}

export async function enableFollowupContext() {
  await openUnitMenu();
  try {
    const label = $(".unit-options-popup:popover-open").$("label*=전체 문맥");
    if (!(await label.$("input").isSelected())) await label.click();
  } finally {
    await closeUnitMenu();
  }
  await settleUnitDisplay();
}

export async function recordFollowup(name, observation) {
  assert(/^[a-z0-9-]+$/.test(name));
  await mkdir(followupDirectory, { recursive: true });
  await writeFile(
    `${followupDirectory}/followup-${name}.json`,
    JSON.stringify(observation, null, 2),
  );
  await browser.saveScreenshot(`${followupDirectory}/followup-${name}.png`);
}

export async function followupIdentity() {
  return browser.execute(() => ({
    selected: document.querySelector(".unit-picker select")?.value,
    filter: document.querySelector(".unit-progress .unit-filter select")?.value,
    input: document.querySelector(".unit-comments textarea")?.value ?? "",
  }));
}
