import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import { createHash } from "node:crypto";
const directory = dirname(fileURLToPath(import.meta.url));
const context = vm.createContext({});
vm.runInContext(readFileSync(resolve(directory, "reimplementation-data.js"), "utf8"), context);
const screens = context.reimplementationScreens;
test("11 historical screens retain original designs and R identifiers", () => {
  assert.equal(screens.length, 11);
  assert.equal(new Set(screens.map(screen => screen.id)).size, 11);
  for (const screen of screens) {
    assert.ok(existsSync(resolve(directory, screen.target)), screen.id);
    assert.ok(existsSync(resolve(directory, screen.before)), screen.id);
    assert.ok(existsSync(resolve(directory, screen.after)), `${screen.id} after`);
    assert.ok(screen.note.length > 20);
    assert.match(screen.tasks, /^R\d+-\d{2}(?: R\d+-\d{2})*$/);
    assert.match(screen.after, /^reimplementation-captures\/after\//);
  }
});
test("missing captures are disclosed, original and new paths cannot overwrite each other", () => {
  const source = readFileSync(resolve(directory, "design-reimplementation.js"), "utf8");
  assert.match(source, /미확보/);
  for (const screen of screens) assert.notEqual(screen.before, screen.after);
  const manifest = JSON.parse(readFileSync(resolve(directory, "reimplementation-captures/manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  for (const capture of manifest.captures) {
    assert.ok(existsSync(resolve(directory, "reimplementation-captures", capture.file)));
    assert.match(capture.sha256, /^[a-f0-9]{64}$/);
    assert.equal(createHash("sha256").update(readFileSync(resolve(directory, "reimplementation-captures", capture.file))).digest("hex"), capture.sha256, capture.file);
  }
});
test("comparison resources remain local and state designs disclose their synthetic nature", () => {
  for (const file of ["design-reimplementation.html", "reimplementation-states.html"]) {
    const html = readFileSync(resolve(directory, file), "utf8");
    assert.match(html, /lang="ko"/);
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      assert.doesNotMatch(match[1], /^https?:/);
      assert.ok(existsSync(resolve(directory, match[1].split("#")[0])), match[1]);
    }
  }
  assert.match(readFileSync(resolve(directory, "reimplementation-states.html"), "utf8"), /실제 앱 캡처나 동작 검증이 아닙니다/);
});
