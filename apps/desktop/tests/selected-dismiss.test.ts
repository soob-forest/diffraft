import { expect, it, vi } from "vitest";
import { dismissSelectedDraft } from "../src/review/selected-dismiss";

function fixture() {
  let value = {
    instruction: "보존할 지시",
    target: { id: "고정 대상" },
    prepared: { id: "확인" },
    prepareOnOpen: true,
  };
  const close = vi.fn(),
    flush = vi.fn(async () => {});
  const draft = {
    value,
    flush,
    replace: (expected: unknown, next: typeof value) => {
      if (value === expected) value = next;
    },
  };
  return { draft, close, flush, value: () => value };
}
it("preserves the exact target and instruction, expires confirmation, and closes after storage", async () => {
  const f = fixture(),
    target = f.value().target;
  expect(
    await dismissSelectedDraft({
      draft: f.draft,
      read: f.value,
      close: f.close,
      isCurrent: () => true,
    } as never),
  ).toBe(true);
  expect(f.value()).toMatchObject({
    instruction: "보존할 지시",
    prepared: null,
    prepareOnOpen: false,
  });
  expect(f.value().target).toBe(target);
  expect(f.close).toHaveBeenCalledOnce();
});
it("does not close or erase input if storage fails", async () => {
  const f = fixture(),
    before = f.value();
  f.flush.mockRejectedValueOnce(new Error("fixture storage"));
  await expect(
    dismissSelectedDraft({
      draft: f.draft,
      read: f.value,
      close: f.close,
      isCurrent: () => true,
    } as never),
  ).rejects.toThrow("fixture storage");
  expect(f.close).not.toHaveBeenCalled();
  expect(f.value()).toBe(before);
});
it("does not close another owner or newer input after a delayed flush", async () => {
  const f = fixture();
  let current = true;
  f.flush.mockImplementationOnce(async () => {
    current = false;
  });
  expect(
    await dismissSelectedDraft({
      draft: f.draft,
      read: f.value,
      close: f.close,
      isCurrent: () => current,
    } as never),
  ).toBe(false);
  expect(f.close).not.toHaveBeenCalled();
});
it("keeps newer typing when it arrives while a close is saving", async () => {
  const f = fixture();
  f.flush.mockImplementationOnce(async () => {
    f.draft.replace(f.value(), { ...f.value(), instruction: "더 최근 입력" });
  });
  expect(
    await dismissSelectedDraft({
      draft: f.draft,
      read: f.value,
      close: f.close,
      isCurrent: () => true,
    } as never),
  ).toBe(false);
  expect(f.value().instruction).toBe("더 최근 입력");
  expect(f.close).not.toHaveBeenCalled();
});
it("keeps the composer if saving the expired confirmation fails", async () => {
  const f = fixture();
  f.flush
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("fixture storage"));
  await expect(
    dismissSelectedDraft({
      draft: f.draft,
      read: f.value,
      close: f.close,
      isCurrent: () => true,
    } as never),
  ).rejects.toThrow("fixture storage");
  expect(f.value().instruction).toBe("보존할 지시");
  expect(f.close).not.toHaveBeenCalled();
});
