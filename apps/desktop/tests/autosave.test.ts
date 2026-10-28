import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_MS, Autosave } from "../src/editor/autosave";
import type { DocumentSnapshot } from "../src/generated/DocumentSnapshot";

const initial: DocumentSnapshot = {
  id: "doc",
  title: "문서",
  path: "/fixture.md",
  versionId: "v1",
  version: 1,
  content: "원문",
  contentHash: "hash",
  status: "READY",
};
afterEach(() => vi.useRealTimers());

describe("serialized autosave", () => {
  it("retains the buffer when a committed retry has been superseded", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce({ message: "저장 응답 유실" })
      .mockRejectedValueOnce({
        code: "STALE_BASE",
        message: "최신 버전 확인 필요",
      });
    const queue = new Autosave(initial, save, () => {});
    queue.change("응답이 유실된 입력");
    await expect(queue.flush()).rejects.toBeDefined();
    queue.change("보존할 추가 입력");
    await expect(queue.retry()).rejects.toMatchObject({ code: "STALE_BASE" });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
    expect(queue.content).toBe("보존할 추가 입력");
    expect(queue.document).toEqual(initial);
    expect(queue.status.dirty).toBe(true);
    expect(queue.status.error).toBe("최신 버전 확인 필요");
    queue.dispose();
  });
  it("adopts an approved saved head without saving an old editor buffer", async () => {
    const save = vi.fn();
    const queue = new Autosave(initial, save, () => {});
    queue.adoptSaved({
      ...initial,
      content: "승인한 원문",
      version: 2,
      versionId: "v2",
    });
    await queue.flush();
    expect(queue.content).toBe("승인한 원문");
    expect(save).not.toHaveBeenCalled();
    expect(() => queue.adoptSaved(initial)).toThrow(/이전/);
  });
  it("retains dirty text unless the user explicitly resolved a saved conflict", () => {
    const queue = new Autosave(initial, vi.fn(), () => {});
    queue.change("보존할 앱 입력");
    const resolved = { ...initial, content: "외부 수용", version: 2 };
    expect(() => queue.adoptSaved(resolved)).toThrow(/입력/);
    expect(queue.content).toBe("보존할 앱 입력");
    queue.block(new Error("외부 변경"));
    queue.adoptSaved(resolved, true);
    expect(queue.status.error).toBe("");
    expect(queue.status.dirty).toBe(false);
  });
  it("resolves an uncertain save before saving an undo back to the old text", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce({ message: "저장 응답 유실" })
      .mockImplementation(async (request) => ({
        ...initial,
        content: request.content,
        version: request.expectedVersion + 1,
      }));
    const queue = new Autosave(initial, save, () => {});
    queue.change("서버에서 저장되었을 수 있음");
    await expect(queue.flush()).rejects.toBeDefined();
    queue.change(initial.content);
    await queue.retry();
    expect(save).toHaveBeenCalledTimes(3);
    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
    expect(queue.document.content).toBe(initial.content);
    expect(queue.document.version).toBe(3);
  });
  it("permits leaving an unchanged conflicted document while writes remain blocked", async () => {
    const save = vi.fn();
    const queue = new Autosave(
      { ...initial, status: "CONFLICT" },
      save,
      () => {},
    );
    await expect(queue.flush()).resolves.toBeUndefined();
    queue.change("새 입력");
    await expect(queue.flush()).rejects.toThrow(/복구/);
    expect(save).not.toHaveBeenCalled();
  });
  it("saves after 500ms and does not replace newer input with an older response", async () => {
    vi.useFakeTimers();
    let finish: (value: DocumentSnapshot) => void = () => {};
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<DocumentSnapshot>((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation(async (request) => ({
        ...initial,
        content: request.content,
        version: request.expectedVersion + 1,
      }));
    const queue = new Autosave(initial, save, () => {});
    queue.change("첫 입력");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 1);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    queue.change("최신 입력");
    finish({ ...initial, content: "첫 입력", version: 2 });
    await queue.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].expectedVersion).toBe(2);
    expect(queue.content).toBe("최신 입력");
    expect(queue.document.version).toBe(3);
    expect(queue.status.dirty).toBe(false);
  });
  it("keeps failed content and retries the same operation before newer input", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce({ message: "디스크 가득 참" })
      .mockImplementation(async (request) => ({
        ...initial,
        content: request.content,
        version: request.expectedVersion + 1,
      }));
    const queue = new Autosave(initial, save, () => {});
    queue.change("보존할 입력");
    await expect(queue.flush()).rejects.toMatchObject({
      message: "디스크 가득 참",
    });
    queue.change("추가 입력");
    await expect(queue.flush()).rejects.toBeDefined();
    expect(save).toHaveBeenCalledTimes(1);
    await queue.retry();
    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
    expect(queue.document.content).toBe("추가 입력");
    expect(queue.document.version).toBe(3);
  });
  it("waits for composition and blocks navigation without losing text", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (request) => ({
      ...initial,
      content: request.content,
      version: 2,
    }));
    const queue = new Autosave(initial, save, () => {});
    queue.composition(true);
    queue.change("한");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    expect(save).not.toHaveBeenCalled();
    await expect(queue.flush()).rejects.toThrow(/조합/);
    queue.composition(false);
    await queue.flush();
    expect(queue.document.content).toBe("한");
  });
  it("external conflicts stop queued writes and retain the editor buffer", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const queue = new Autosave(initial, save, () => {});
    queue.change("로컬 입력");
    queue.block({ message: "외부 변경" });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2);
    await expect(queue.flush()).rejects.toMatchObject({ message: "외부 변경" });
    expect(queue.content).toBe("로컬 입력");
    expect(save).not.toHaveBeenCalled();
  });
  it("composition beginning during a save pauses without a permanent failure", async () => {
    let finish: (value: DocumentSnapshot) => void = () => {};
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<DocumentSnapshot>((resolve) => {
            finish = resolve;
          }),
      )
      .mockImplementation(async (request) => ({
        ...initial,
        content: request.content,
        version: 3,
      }));
    const queue = new Autosave(initial, save, () => {});
    queue.change("먼저");
    const saving = queue.flush();
    queue.composition(true);
    queue.change("한");
    finish({ ...initial, content: "먼저", version: 2 });
    await expect(saving).rejects.toThrow(/조합/);
    expect(queue.status.error).toBe("");
    queue.composition(false);
    await queue.flush();
    expect(queue.document.content).toBe("한");
  });
  it("a scheduled save cannot turn active composition into a permanent error", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const queue = new Autosave(initial, save, () => {});
    queue.change("ㅎ");
    queue.composition(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS);
    expect(queue.status.error).toBe("");
    expect(save).not.toHaveBeenCalled();
  });
});
