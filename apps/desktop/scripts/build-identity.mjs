import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function fingerprintFiles(entries) {
  const hash = createHash("sha256");
  for (const entry of [...entries].sort((a, b) =>
    a.name.localeCompare(b.name, "en"),
  )) {
    hash.update(`${entry.name}\0${entry.content.length}\0`);
    hash.update(entry.content);
  }
  return hash.digest("hex");
}
async function directoryEntries(app, directory) {
  const entries = [];
  for (const item of await readdir(join(app, directory), {
    withFileTypes: true,
  })) {
    const name = `${directory}/${item.name}`;
    if (item.isDirectory())
      entries.push(...(await directoryEntries(app, name)));
    else if (item.isFile())
      entries.push({ name, content: await readFile(join(app, name)) });
  }
  return entries;
}
export async function buildIdentity(app, profile) {
  const entries = [];
  for (const directory of [
    "src",
    "src-tauri/src",
    "src-tauri/migrations",
    "src-tauri/icons",
  ])
    entries.push(...(await directoryEntries(app, directory)));
  for (const name of [
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "scripts/native.mjs",
    "scripts/build-identity.mjs",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "src-tauri/build.rs",
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.internal.conf.json",
    "src-tauri/tauri.e2e.conf.json",
  ])
    entries.push({ name, content: await readFile(join(app, name)) });
  const sourceHash = fingerprintFiles(entries),
    version = JSON.parse(
      await readFile(join(app, "package.json"), "utf8"),
    ).version;
  return {
    id: `${sourceHash.slice(0, 16)}-${profile}`,
    sourceHash,
    profile,
    version,
    builtAt: new Date().toISOString(),
  };
}
export function identityEnvironment(identity) {
  return {
    VITE_DOCREVIEW_BUILD_ID: identity.id,
    VITE_DOCREVIEW_BUILD_AT: identity.builtAt,
    VITE_DOCREVIEW_BUILD_PROFILE: identity.profile,
    VITE_DOCREVIEW_VERSION: identity.version,
  };
}
export async function recordIdentity(app, executable, identity) {
  const binaryHash = createHash("sha256")
    .update(await readFile(executable))
    .digest("hex");
  await mkdir(join(app, ".artifacts"), { recursive: true });
  await writeFile(
    join(app, `.artifacts/build-${identity.profile}.json`),
    `${JSON.stringify({ ...identity, executable, binaryHash }, null, 2)}\n`,
  );
}
