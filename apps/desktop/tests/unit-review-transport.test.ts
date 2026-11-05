import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { reviewCommand } from "../src/review/api";
import { projection } from "./support/review-projection";
import {
  installOriginalTransport,
  originalTransportState,
  releaseOriginalRequest,
  restoreOriginalTransport,
  syntheticOriginalError,
} from "./support/unit-review-original-transport.mjs";

const batchId = "batch-fixture";
const endpoint = (command: string) => `ipc://localhost/${command}`;
const value = projection();
let internals: object;
let transport: ReturnType<typeof vi.fn>;

function readOriginal(id = batchId) {
  return reviewCommand({ kind: "original_rewrite", batchId: id }, "projection");
}

beforeEach(() => {
  transport = vi.fn(
    async () =>
      new Response(JSON.stringify({ kind: "projection", value }), {
        headers: { "Content-Type": "application/json", "Tauri-Response": "ok" },
      }),
  );
  internals = { convertFileSrc: endpoint };
  Object.defineProperty(internals, "invoke", {
    value: async (command: string, args: unknown) => {
      const response = await fetch(endpoint(command), {
        method: "POST",
        body: JSON.stringify(args),
      });
      const body = await response.json();
      if (response.headers.get("Tauri-Response") !== "ok") throw body;
      return body;
    },
  });
  Object.freeze(internals);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("__TAURI_INTERNALS__", internals);
  vi.stubGlobal("fetch", transport);
  vi.stubGlobal("browser", {
    execute: async (run: (...args: unknown[]) => unknown, ...args: unknown[]) =>
      run(...args),
  });
});

afterEach(async () => {
  try {
    await restoreOriginalTransport();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("holds the matching SDK read with frozen invoke and restores the fetch descriptor exactly", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  await installOriginalTransport(batchId);
  const pending = expect(readOriginal()).resolves.toEqual(value);
  expect(await originalTransportState()).toEqual({ calls: 1, pending: 1 });
  expect(transport).not.toHaveBeenCalled();
  await releaseOriginalRequest("real");
  await pending;
  expect(transport).toHaveBeenCalledTimes(1);
  await restoreOriginalTransport();
  expect(Object.getOwnPropertyDescriptor(globalThis, "fetch")).toEqual(
    descriptor,
  );
  expect(Object.getOwnPropertyDescriptor(internals, "invoke")?.writable).toBe(
    false,
  );
  expect(
    Object.getOwnPropertyDescriptor(internals, "invoke")?.configurable,
  ).toBe(false);
});

it("delivers a protocol error response without delegating, then permits a real retry", async () => {
  await installOriginalTransport(batchId);
  const failure = expect(readOriginal()).rejects.toMatchObject({
    message: syntheticOriginalError,
  });
  await releaseOriginalRequest("failure");
  await failure;
  expect(transport).not.toHaveBeenCalled();
  const retry = expect(readOriginal()).resolves.toEqual(value);
  await releaseOriginalRequest("real");
  await retry;
  expect(await originalTransportState()).toEqual({ calls: 2, pending: 0 });
  expect(transport).toHaveBeenCalledTimes(1);
});

it("passes other requests through and settles a held request during cleanup", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  await installOriginalTransport(batchId);
  await readOriginal("another-batch");
  await reviewCommand(
    { kind: "projection", batchId, expectedHeadId: "head1" },
    "projection",
  );
  await fetch("https://fixture.invalid/resource");
  await fetch(endpoint("review_command"), {
    method: "POST",
    body: "{malformed",
  });
  expect(transport).toHaveBeenCalledTimes(4);
  expect(await originalTransportState()).toEqual({ calls: 0, pending: 0 });
  const pending = expect(readOriginal()).rejects.toMatchObject({
    message: "합성 원래 후보 관측을 종료했습니다.",
  });
  await restoreOriginalTransport();
  await pending;
  expect(Object.getOwnPropertyDescriptor(globalThis, "fetch")).toEqual(
    descriptor,
  );
});
