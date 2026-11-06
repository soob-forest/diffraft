import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import type { SavedGenerationRequest } from "../src/generated/SavedGenerationRequest";
import { sendRequest } from "../src/generation/api";
import { generationActivity } from "../src/generation/generation-activity";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const request = {
  kind: "rewrite",
  value: { documentId: "document" },
} as SavedGenerationRequest;
beforeEach(() => vi.resetAllMocks());
it("publishes the document lock before native generation and releases it after failure", async () => {
  let reject: (reason: Error) => void = () => {};
  const notify = vi.fn();
  const unsubscribe = generationActivity.subscribe(notify);
  vi.mocked(invoke).mockImplementationOnce(() => {
    expect(generationActivity.busy("document")).toBe(true);
    expect(generationActivity.busy("other")).toBe(false);
    return new Promise((_, fail) => {
      reject = fail;
    });
  });
  const pending = sendRequest(request);
  expect(generationActivity.busy("document")).toBe(true);
  reject(new Error("fixture generation failure"));
  await expect(pending).rejects.toThrow("fixture generation failure");
  expect(generationActivity.busy("document")).toBe(false);
  expect(notify).toHaveBeenCalledTimes(2);
  unsubscribe();
});
it("keeps another pending operation locked after one request finishes", async () => {
  let finish: (value: unknown) => void = () => {};
  vi.mocked(invoke).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.mocked(invoke).mockRejectedValueOnce(new Error("second request rejected"));
  const first = sendRequest(request);
  await expect(sendRequest(request)).rejects.toThrow("second request rejected");
  expect(generationActivity.busy("document")).toBe(true);
  finish({ id: "batch" });
  await first;
  expect(generationActivity.busy("document")).toBe(false);
});
