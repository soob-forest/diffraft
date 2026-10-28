import { expect, it, vi } from "vitest";
import { Autosave } from "../src/editor/autosave";
import type { DocumentSnapshot } from "../src/generated/DocumentSnapshot";

const document: DocumentSnapshot = {
  id: "doc",
  title: "문서",
  path: "/fixture.md",
  versionId: "v1",
  version: 1,
  content: "원문",
  contentHash: "hash",
  status: "CONFLICT",
};
it("only permits leaving after this exact buffer was preserved; writes remain blocked", async () => {
  const save = vi.fn();
  const queue = new Autosave(document, save, () => {});
  queue.change("보존한 입력");
  await expect(queue.flushForLeave()).rejects.toBeDefined();
  queue.preservedCopy("보존한 입력");
  await expect(queue.flushForLeave()).resolves.toBeUndefined();
  await expect(queue.flush()).rejects.toBeDefined();
  queue.change("추가 입력");
  await expect(queue.flushForLeave()).rejects.toBeDefined();
  expect(save).not.toHaveBeenCalled();
});
it("a late copy response cannot permit leaving newer input", async () => {
  const queue = new Autosave(document, vi.fn(), () => {});
  queue.change("최신 입력");
  queue.preservedCopy("이전 입력");
  await expect(queue.flushForLeave()).rejects.toBeDefined();
});
