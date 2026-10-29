import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import test from "node:test";

const directory = dirname(fileURLToPath(import.meta.url));
const context = vm.createContext({});
vm.runInContext(readFileSync(resolve(directory, "usability-scenes.js"), "utf8"), context);
const { scenes, getBaseline } = context.docReviewComparison;

test("every comparison preserves a traceable baseline and an explicitly proposed screen", () => {
  assert.equal(scenes.length, 6);
  assert.equal(new Set(scenes.map((scene) => scene.id)).size, scenes.length);
  for (const scene of scenes) {
    assert.match(scene.id, /^[a-z-]+$/);
    assert.ok(scene.beforeNote && scene.afterNote);
    assert.equal(Boolean(scene.image), !scene.before);
    if (scene.image) assert.ok(existsSync(resolve(directory, scene.image)), scene.id);
    else {
      assert.match(scene.beforeNote, /재구성/);
      assert.match(scene.before(), /class="mock/);
    }
    assert.match(scene.after(), /class="mock/);
    assert.match(scene.after(), /inert/);
    assert.doesNotMatch(scene.after(), /<script|<iframe|https?:|on(?:click|load)=/i);
    assert.ok((scene.width || 1440) >= 800);
    assert.ok((scene.height || 900) >= 600);
  }
});

test("historical changes retain descriptions and well-formed task identifiers", () => {
  for (const scene of scenes) {
    assert.ok(scene.changes.length >= 2, scene.id);
    for (const [before, after, references] of scene.changes) {
      assert.ok(before && after);
      assert.match(references, /^T\d+-\d{2}(?:~\d{2})?(?:, T\d+-\d{2}(?:~\d{2})?)*$/);
      for (const match of references.matchAll(/T\d+-(\d+)(?:~(\d+))?/g)) {
        assert.ok(Number(match[2] || match[1]) >= Number(match[1]), references);
      }
    }
  }
});

test("comparison can load its local resources without third-party assets", () => {
  const html = readFileSync(resolve(directory, "usability-comparison.html"), "utf8");
  assert.match(html, /lang="ko"/);
  assert.match(html, /<noscript>/);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.doesNotMatch(match[1], /^https?:/);
    assert.ok(existsSync(resolve(directory, match[1].split("#")[0])), match[1]);
  }
});

test("original design and current app remain distinct comparison sources", () => {
  const manifest = JSON.parse(readFileSync(resolve(directory, "assets/screen-manifest.json"), "utf8"));
  for (const scene of scenes) {
    const original = getBaseline(scene, "design");
    assert.ok(manifest.some((entry) => `assets/${entry.png}` === original.image));
    assert.ok(existsSync(resolve(directory, original.image)));
    assert.match(original.provenance, /기존 디자인.*0\.2/);
    assert.match(original.note, /상태|크기|시안/);
    const current = getBaseline(scene, "current");
    assert.equal(current.image, scene.image);
    assert.equal(current.note, scene.beforeNote);
    assert.deepEqual(getBaseline(scene, "unknown"), current);
    assert.ok(scene.visualNote.length > 20);
  }
});

test("actual comparison retains local before/after captures and discloses verification limits", () => {
  const html = readFileSync(resolve(directory, "usability-actual.html"), "utf8");
  assert.match(html, /사용자 평가는 미검증/);
  assert.match(html, /1440×900/);
  assert.match(html, /150%/);
  assert.match(html, /200%/);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (match[1].startsWith("#")) continue;
    assert.doesNotMatch(match[1], /^https?:/);
    assert.ok(existsSync(resolve(directory, match[1].split("#")[0])), match[1]);
  }
  for (const scene of ["request", "review", "comment"]) {
    assert.ok(html.includes(`usability-captures/before/${scene}.png`));
    assert.ok(html.includes(`usability-captures/after/${scene}.png`));
  }
});
