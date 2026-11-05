import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  settleUnitLayout,
  showOriginalUnitComparison,
} from "./unit-review-fixture.mjs";
import {
  assertUnitInvariant,
  readUnitInvariant,
} from "./unit-review-invariants.mjs";
import {
  installOriginalTransport,
  originalTransportState,
  releaseOriginalRequest,
  restoreOriginalTransport,
  syntheticOriginalError,
  waitOriginalRequest,
} from "./unit-review-original-transport.mjs";

const activeBody = ".unit-diff-body:not([hidden])";

export async function assertOriginalLoadingFailureRetry(fixture) {
  await returnToCurrent();
  const before = await readUnitInvariant(fixture);
  const identity = await comparisonIdentity();
  try {
    await installOriginalTransport(fixture.batch.id);
    await remountReview(fixture.document.title);
    await openOriginalIfNeeded();
    await waitOriginalRequest(1);
    await assertOriginalLoading();
    await releaseOriginalRequest("failure");
    await browser.waitUntil(async () =>
      (await $(`${activeBody} [role=alert]`).getText()).includes(
        syntheticOriginalError,
      ),
    );
    assert.equal(await $(`${activeBody} .text-diff`).isExisting(), false);
    await $(activeBody).$("button=다시 불러오기").click();
    await waitOriginalRequest(2);
    await assertOriginalLoading();
    await releaseOriginalRequest("real");
    await assertOriginalText();
    await returnToCurrent();
    await assertCurrentText(before.version);
    await openOriginalIfNeeded();
    await assertOriginalText();
    assert.deepEqual(await originalTransportState(), { calls: 2, pending: 0 });
    await returnToCurrent();
    assert.deepEqual(await comparisonIdentity(), identity);
    await saveReadEvidence("retry", {
      ...(await originalTransportState()),
      identity,
    });
  } finally {
    try {
      await returnToCurrent();
    } finally {
      await restoreOriginalTransport();
      await assertUnitInvariant(fixture, before);
    }
  }
}

export async function assertLateOriginalReadKeepsCurrent(fixture) {
  await returnToCurrent();
  const before = await readUnitInvariant(fixture);
  const identity = await comparisonIdentity();
  try {
    await installOriginalTransport(fixture.batch.id);
    await remountReview(fixture.document.title);
    await openOriginalIfNeeded();
    await waitOriginalRequest(1);
    await assertOriginalLoading();
    await returnToCurrent();
    await assertCurrentText(before.version);
    await releaseOriginalRequest("real");
    await settleUnitLayout();
    assert.equal(await $(".unit-original-notice").isExisting(), false);
    await assertCurrentText(before.version);
    assert.deepEqual(await comparisonIdentity(), identity);
    await saveReadEvidence("late-return", await originalTransportState());
  } finally {
    try {
      await returnToCurrent();
    } finally {
      await restoreOriginalTransport();
      await assertUnitInvariant(fixture, before);
    }
  }
}

async function remountReview(title) {
  await browser.setWindowSize(1440, 900);
  if (!(await $(".sidebar").isDisplayed())) await $("button=문서 목록").click();
  const documents = await $$(".sidebar ul button");
  let alternate;
  for (const document of documents)
    if ((await document.getText()) !== title) {
      alternate = document;
      break;
    }
  assert(alternate, "비교 캐시 재마운트를 위한 다른 합성 문서가 필요합니다.");
  await alternate.click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) !== title,
  );
  await $(".sidebar ul").$(`button=${title}`).click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === title,
  );
  await $("button=변경 검토").click();
  await $(".unit-review").waitForDisplayed();
}

async function openOriginalIfNeeded() {
  if (!(await $(".unit-original-notice").isExisting()))
    await showOriginalUnitComparison();
}

async function returnToCurrent() {
  const back = $("button=현재 검토로 돌아가기");
  if (await back.isExisting()) await back.click();
  await settleUnitLayout();
}

async function assertOriginalLoading() {
  assert.match(await $(activeBody).getText(), /원래 전체 후보를 불러오는 중/);
  assert.equal(await $(`${activeBody} .cm-content`).isExisting(), false);
  assert.equal(await $(`${activeBody} .text-diff`).isExisting(), false);
}

async function openActiveText() {
  const text = $(`${activeBody} .text-diff`);
  await text.waitForDisplayed();
  if ((await text.getAttribute("open")) === null)
    await text.$("summary").click();
  await $(`${activeBody} .text-diff-basis`).waitForDisplayed();
  return text;
}

async function assertOriginalText() {
  await $(`${activeBody} .cm-content`).waitForExist();
  const text = await openActiveText();
  assert.match(await text.getText(), /20분/);
  assert.match(
    await $(`${activeBody} .text-diff-basis`).getText(),
    /당시 기준본 · v14.*읽기 전용/,
  );
}

async function assertCurrentText(version) {
  const text = await openActiveText();
  assert.match(
    await $(`${activeBody} .text-diff-basis`).getText(),
    new RegExp(`현재 확정본 · v${version}`),
  );
  assert.doesNotMatch(await text.getText(), /20분/);
}

async function comparisonIdentity() {
  return browser.execute(async () => {
    const input =
      document.querySelector(".unit-comments textarea")?.value ?? "";
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(input),
    );
    return {
      selected: document.querySelector(".unit-picker select").value,
      filter: document.querySelector(".unit-progress .unit-filter select")
        .value,
      views: [...document.querySelectorAll(".unit-view-options input")].map(
        (node) => node.checked,
      ),
      draftHash: [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
    };
  });
}

async function saveReadEvidence(name, evidence) {
  const directory = ".artifacts/unit-review/after";
  await mkdir(directory, { recursive: true });
  await writeFile(
    `${directory}/original-${name}-transport.json`,
    JSON.stringify(evidence, null, 2),
  );
  await browser.saveScreenshot(`${directory}/original-${name}-transport.png`);
}
