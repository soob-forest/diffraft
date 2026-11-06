import { expect, it, vi } from "vitest";
import { generationActivity } from "../src/generation/generation-activity";
import { submitDraft } from "../src/generation/submit-request";

const documentId = "confirmed-document";
function draft() {
  return {
    locked: false,
    pending: { kind: "generate", request: { documentId } },
    beginSubmitted: vi.fn(() => ({})),
    clearSubmitted: vi.fn(),
    clearPending: vi.fn(),
  };
}
it("locks review immediately while the confirmed request waits for draft storage", async () => {
  const value = draft();
  let finish = () => {};
  const flushing = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const send = vi.fn(async () => {
    expect(generationActivity.busy(documentId)).toBe(true);
  });
  const pending = submitDraft(
    value as never,
    send,
    () => flushing,
    () => true,
  );
  const lockedBeforeFlush = generationActivity.busy(documentId);
  finish();
  await pending;
  expect(lockedBeforeFlush).toBe(true);
  expect(generationActivity.busy(documentId)).toBe(false);
  expect(value.clearSubmitted).toHaveBeenCalledOnce();
});
it("retains the instruction and does not send after the composer changes owner during storage", async () => {
  const value = draft(),
    send = vi.fn();
  let current = true;
  await expect(
    submitDraft(
      value as never,
      send,
      async () => {
        current = false;
      },
      () => current,
    ),
  ).rejects.toThrow(/화면/);
  expect(send).not.toHaveBeenCalled();
  expect(value.clearSubmitted).not.toHaveBeenCalled();
  expect(value.clearPending).toHaveBeenCalledOnce();
  expect(generationActivity.busy(documentId)).toBe(false);
});
it("unlocks and preserves the submitted draft when preflight storage fails", async () => {
  const value = draft(),
    send = vi.fn();
  await expect(
    submitDraft(
      value as never,
      send,
      async () => {
        throw new Error("fixture storage failure");
      },
      () => true,
    ),
  ).rejects.toThrow("fixture storage failure");
  expect(send).not.toHaveBeenCalled();
  expect(value.clearPending).toHaveBeenCalledOnce();
  expect(value.clearSubmitted).not.toHaveBeenCalled();
  expect(generationActivity.busy(documentId)).toBe(false);
});
