import { invoke } from "@tauri-apps/api/core";
import type { Autosave } from "../editor/autosave";
import type { DocumentSnapshot } from "../generated/DocumentSnapshot";
import type { ExportFileKind } from "../generated/ExportFileKind";
import type { ExportRequest } from "../generated/ExportRequest";
import type { ExportSaved } from "../generated/ExportSaved";
import type { ExportSnapshot } from "../generated/ExportSnapshot";
import { SCHEMA_VERSION } from "../ipc";

export function exportRequest(document: DocumentSnapshot): ExportRequest {
  return {
    schemaVersion: SCHEMA_VERSION,
    documentId: document.id,
    expectedHeadId: document.versionId,
    expectedPath: document.path,
  };
}

export async function prepareExport(queue: Autosave): Promise<ExportSnapshot> {
  await queue.flush();
  return invoke("export_snapshot", { request: exportRequest(queue.document) });
}

export async function copyExport(
  queue: Autosave,
  snapshot: ExportSnapshot,
): Promise<void> {
  await queue.flush();
  await invoke("copy_export", { request: exportRequest(snapshot.document) });
}

export async function saveExport(
  queue: Autosave,
  snapshot: ExportSnapshot,
  kind: ExportFileKind,
): Promise<ExportSaved | null> {
  await queue.flush();
  return invoke("save_export", {
    request: { snapshot: exportRequest(snapshot.document), kind },
  });
}
