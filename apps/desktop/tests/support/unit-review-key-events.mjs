import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

export const nativeKey = {
  enter: 36,
  tab: 48,
  space: 49,
  escape: 53,
  next: 98,
  previous: "shift:98",
  downEnter: "down:36",
  downSpace: "down:49",
  upEnter: "up:36",
  upSpace: "up:49",
  repeatEnter: "repeat:36",
  repeatSpace: "repeat:49",
};
const allowed = new Set([
  "36",
  "48",
  "49",
  "53",
  "98",
  "115",
  "125",
  "126",
  "shift:98",
  "repeat:36",
  "repeat:49",
  "down:36",
  "down:49",
  "up:36",
  "up:49",
]);
const maximumCommands = 64;
const app = new URL("../../src-tauri/target/debug/docreview", import.meta.url)
  .pathname;
const helper = new URL("../../.artifacts/native-keyboard", import.meta.url)
  .pathname;

export function foregroundUnitApplication(pid) {
  assert(Number.isInteger(pid) && pid > 0);
  const evidence = execFileSync(helper, [String(pid), app, "--focus-only"], {
    timeout: 5000,
    stdio: "pipe",
  });
  return JSON.parse(evidence.toString("utf8"));
}

export function nativeKeys(pid, codes) {
  assert(Number.isInteger(pid) && pid > 0);
  assert(codes.length > 0 && codes.length <= maximumCommands);
  const commands = codes.map(String);
  assert(
    commands.every((code) => allowed.has(code)),
    "허용된 검사 키만 사용할 수 있습니다.",
  );
  try {
    execFileSync(helper, [String(pid), app, ...commands], {
      timeout: 15_000,
      stdio: "pipe",
    });
  } catch (error) {
    throw new Error(
      `Native keyboard: ${error.code ?? error.status}; ${String(error.stderr ?? "").slice(0, 300)}`,
    );
  }
}

export async function installNativeKeyTrace() {
  await browser.execute(() => {
    if (globalThis.__unitKeyboardTrace)
      throw new Error("키 관측기가 이미 설치됐습니다.");
    const trace = { events: [] };
    trace.listener = (event) => {
      if (!["Enter", " ", "Tab", "Escape", "F7"].includes(event.key)) return;
      if (trace.events.length >= 128) return;
      trace.events.push({
        type: event.type,
        key: event.key,
        repeat: event.repeat,
        shiftKey: event.shiftKey,
        isTrusted: event.isTrusted,
        isComposing: event.isComposing,
        defaultPrevented: event.defaultPrevented,
        approvalTarget:
          event.target instanceof Element &&
          event.target.matches(".unit-actions .primary"),
        holdOrigin:
          event.target instanceof Element &&
          event.target.matches(".unit-selected-heading, .unit-progress strong"),
      });
    };
    globalThis.__unitKeyboardTrace = trace;
    window.addEventListener("keydown", trace.listener);
    window.addEventListener("keyup", trace.listener);
  });
}

export async function readNativeKeyTrace() {
  return browser.execute(() => globalThis.__unitKeyboardTrace?.events ?? []);
}

export async function removeNativeKeyTrace() {
  await browser.execute(() => {
    const trace = globalThis.__unitKeyboardTrace;
    if (trace) {
      window.removeEventListener("keydown", trace.listener);
      window.removeEventListener("keyup", trace.listener);
      delete globalThis.__unitKeyboardTrace;
    }
  });
}

export async function focusKeyboardTarget(selector) {
  await browser.execute((query) => {
    const target = document.querySelector(query);
    if (!target) throw new Error("키보드 검사 대상을 찾을 수 없습니다.");
    target.focus();
  }, selector);
}

export async function activeKeyboardFocus() {
  return browser.execute(() => {
    const node = document.activeElement;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      tag: node.tagName,
      classes: node.className,
      label: node.getAttribute("aria-label") || node.textContent.trim(),
      hidden: !node.getClientRects().length,
      hit: node.contains(
        document.elementFromPoint(
          (rect.left + rect.right) / 2,
          (rect.top + rect.bottom) / 2,
        ),
      ),
      outline: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
}
