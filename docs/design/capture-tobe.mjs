import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const directory = resolve("docs/design");
const output = join(directory, "tobe-captures/target");
const sources = ["usability-comparison.html", "usability-scenes.js", "usability-comparison.js", "usability-comparison.css"];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect(profile) {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]; break; }
    catch (error) { if (error.code !== "ENOENT") throw error; await pause(50); }
  }
  if (!port) throw new Error("Chrome debugging port unavailable");
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const socket = new WebSocket(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (!data.id) return;
    const request = pending.get(data.id);
    pending.delete(data.id);
    data.error ? request.reject(data.error) : request.resolve(data.result);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { socket, call };
}

async function evaluate(call, expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function capture(call, scene) {
  const width = scene === "narrow" ? 800 : 1440;
  const height = scene === "narrow" ? 600 : 900;
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await evaluate(call, `(() => {
    const scene = docReviewComparison.scenes.find(value => value.id === ${JSON.stringify(scene)});
    document.body.innerHTML = scene.after();
    document.querySelector('.mock').classList.add('refined');
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`);
  const styles = await evaluate(call, `(() => {
    const properties = ['fontFamily','fontSize','fontWeight','lineHeight','color','backgroundColor',
      'padding','margin','gap','border','borderRadius','display','width','height'];
    return [...document.querySelector('.mock').querySelectorAll('*')].map((element, index) => {
      const style = getComputedStyle(element), bounds = element.getBoundingClientRect();
      return { index, tag: element.tagName, class: element.className, text: element.textContent.trim(),
        rect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        style: Object.fromEntries(properties.map(property => [property, style[property]])) };
    });
  })()`);
  const bytes = Buffer.from((await call("Page.captureScreenshot", {
    format: "png", clip: { x: 0, y: 0, width, height, scale: 1 },
  })).data, "base64");
  await writeFile(join(output, `${scene}.png`), bytes);
  await writeFile(join(output, `${scene}.json`), `${JSON.stringify(styles, null, 2)}\n`);
  return { scene, width, height, sha256: digest(bytes), capturedAt: new Date().toISOString() };
}

const profile = await mkdtemp(join(tmpdir(), "docreview-tobe-"));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--no-first-run", "--disable-default-apps", `--user-data-dir=${profile}`,
  "--remote-debugging-port=0", "about:blank",
], { stdio: "ignore" });
let socket;
try {
  const connection = await connect(profile);
  socket = connection.socket;
  const call = connection.call;
  await call("Page.enable");
  await call("Page.navigate", { url: pathToFileURL(join(directory, "usability-comparison.html")).href });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    ready = await evaluate(call, "Boolean(globalThis.docReviewComparison)");
    if (ready) break;
    await pause(50);
  }
  if (!ready) throw new Error("TO-BE sources did not load");
  await mkdir(output, { recursive: true });
  const hashes = {};
  for (const source of sources) hashes[source] = digest(await readFile(join(directory, source)));
  const captures = [];
  for (const scene of ["request", "review", "comment", "resume", "narrow", "connection"])
    captures.push(await capture(call, scene));
  await writeFile(join(output, "manifest.json"), `${JSON.stringify({
    kind: "frozen synthetic TO-BE; not product screenshots", engine: "Chrome headless",
    sources: hashes, captures,
  }, null, 2)}\n`);
  console.log(JSON.stringify({ captures: captures.length, output }));
} finally {
  socket?.close();
  chrome.kill();
  await new Promise((resolve) => chrome.once("exit", resolve));
  await rm(profile, { recursive: true, force: true });
}
