import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import { Autosave } from "../src/editor/autosave";
import { copyExport, prepareExport, saveExport } from "../src/export/actions";
import type { DocumentSnapshot } from "../src/generated/DocumentSnapshot";
import type { ExportSnapshot } from "../src/generated/ExportSnapshot";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
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
const pinned: ExportSnapshot = {
  document: initial,
  pendingGroups: 2,
  pendingRewrites: 0,
};
beforeEach(() => vi.resetAllMocks());

it("waits for buffered content to save before pinning export", async () => {
  const order: string[] = [];
  const saved = { ...initial, content: "최신", version: 2, versionId: "v2" };
  const queue = new Autosave(
    initial,
    async () => {
      order.push("save");
      return saved;
    },
    () => {},
  );
  vi.mocked(invoke).mockImplementation(async () => {
    order.push("snapshot");
    return { ...pinned, document: saved };
  });
  queue.change("최신");
  expect((await prepareExport(queue)).document).toEqual(saved);
  expect(order).toEqual(["save", "snapshot"]);
  expect(invoke).toHaveBeenCalledWith("export_snapshot", {
    request: {
      schemaVersion: 1,
      documentId: "doc",
      expectedHeadId: "v2",
      expectedPath: "/fixture.md",
    },
  });
  queue.dispose();
});

it("does not open export, write clipboard, or write files after a save failure", async () => {
  const queue = new Autosave(
    initial,
    async () => {
      throw new Error("저장 실패");
    },
    () => {},
  );
  queue.change("보존할 입력");
  await expect(prepareExport(queue)).rejects.toThrow("저장 실패");
  await expect(copyExport(queue, pinned)).rejects.toThrow("저장 실패");
  await expect(saveExport(queue, pinned, "working_file")).rejects.toThrow(
    "저장 실패",
  );
  expect(invoke).not.toHaveBeenCalled();
  expect(queue.content).toBe("보존할 입력");
  queue.dispose();
});

it("keeps the confirmed version pinned so a later head cannot silently replace the preview", async () => {
  const queue = new Autosave(
    { ...initial, version: 2, versionId: "v2" },
    vi.fn(),
    () => {},
  );
  vi.mocked(invoke).mockRejectedValue({
    code: "STALE_BASE",
    message: "다시 열기",
  });
  await expect(copyExport(queue, pinned)).rejects.toMatchObject({
    code: "STALE_BASE",
  });
  expect(invoke).toHaveBeenCalledWith("copy_export", {
    request: {
      schemaVersion: 1,
      documentId: "doc",
      expectedHeadId: "v1",
      expectedPath: "/fixture.md",
    },
  });
  queue.dispose();
});

it("leaves local binding untouched when the native file picker is cancelled", async () => {
  const queue = new Autosave(initial, vi.fn(), () => {});
  vi.mocked(invoke).mockResolvedValue(null);
  expect(await saveExport(queue, pinned, "working_file")).toBeNull();
  expect(queue.document.path).toBe(initial.path);
  expect(queue.document.versionId).toBe(initial.versionId);
  queue.dispose();
});
