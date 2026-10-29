import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const directory = dirname(fileURLToPath(import.meta.url));
const read = path => readFileSync(resolve(directory,path));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const scenes = ["request","review","comment","resume","narrow","connection"];
test("the original six TO-BE sources and frozen target PNGs cannot drift", () => {
  const manifest = JSON.parse(read("tobe-captures/target/manifest.json"));
  for (const [path, sha256] of Object.entries(manifest.sources)) assert.equal(hash(read(path)),sha256,path);
  for (const capture of manifest.captures) assert.equal(hash(read(`tobe-captures/target/${capture.scene}.png`)),capture.sha256,capture.scene);
  assert.deepEqual(manifest.captures.map(capture => capture.scene), scenes);
});
test("every scene has separate target, before and after evidence with native viewport metadata", () => {
  for (const scene of scenes) for (const phase of ["target","before","after"]) {
    assert.ok(existsSync(resolve(directory,`tobe-captures/${phase}/${scene}.png`)),`${phase}/${scene}`);
    const meta = JSON.parse(read(`tobe-captures/${phase}/${scene}.json`));
    if (phase !== "target") assert.deepEqual(meta.viewport, scene === "narrow" ? [800,600] : [1440,900]);
  }
});
test("comparison resources stay local and disclose evidence boundaries", () => {
  const html = read("tobe-implementation.html").toString();
  assert.match(html,/lang="ko"/); assert.match(html,/사용자 평가는 미검증/);
  assert.match(html,/실제 사용자 문서나 인증 정보는 포함하지 않습니다/);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.doesNotMatch(match[1],/^https?:/);
    assert.ok(existsSync(resolve(directory,match[1].split("#")[0])),match[1]);
  }
  const script = read("tobe-implementation.js").toString();
  for (const scene of scenes) assert.ok(script.includes(`id:"${scene}"`));
  for (const state of ["review-long-table","comment-long-table","request-failed","applied-version","resume-v13"])
    assert.ok(existsSync(resolve(directory,`tobe-captures/states/${state}.png`)),state);
});

test("native evidence hashes, geometry and nine zoom environments remain traceable", () => {
  const manifest = JSON.parse(read("tobe-captures/after/manifest.json"));
  for (const capture of manifest.captures) assert.equal(hash(read(`tobe-captures/${capture.file}`)),capture.sha256,capture.file);
  const measure = JSON.parse(read("tobe-captures/measurement.json"));
  assert.equal(measure.metrics.length,33); assert.ok(measure.maximumError<=2);
  const zoom = JSON.parse(read("tobe-captures/states/zoom-measurements.json"));
  assert.equal(zoom.length,9);
  assert.ok(zoom.every(row=>row.readable.historySeparated && row.readable.hit && !row.overflow && !row.workspaceOverflow));
});
