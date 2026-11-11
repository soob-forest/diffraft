import { type DocumentList, visibleWorkspace } from "./document-list";
import { editorCommand, pickDocument } from "./editor/api";
import type { AppSnapshot } from "./generated/AppSnapshot";
import type { DocumentSummary } from "./generated/DocumentSummary";
import type { EditorState } from "./generated/EditorState";
import { errorMessage, workspaceSnapshot } from "./ipc";

type Options = {
  lock: { current: boolean };
  list: DocumentList;
  flush: () => Promise<void>;
  currentId?: string;
  setBusy: (value: boolean) => void;
  setError: (value: string) => void;
  setEditor: (value: EditorState | null) => void;
  setSnapshot: (value: AppSnapshot) => void;
  setRemoved: (value: DocumentSummary | null) => void;
};

export function workspaceActions(options: Options) {
  return {
    navigate: (target: string | boolean) =>
      run(options, async () => {
        const id =
          typeof target === "string"
            ? target
            : (await pickDocument(target))?.id;
        if (!id) return;
        const opened = await editorCommand(
          { kind: "select_document", documentId: id },
          "state",
        );
        const snapshot = await workspaceSnapshot();
        options.list.restore(id);
        options.setEditor(opened);
        options.setSnapshot(snapshot);
        options.setRemoved(null);
      }),
    remove: (document: DocumentSummary) =>
      run(options, async () => {
        const snapshot = await workspaceSnapshot();
        const next = visibleWorkspace(snapshot, [
          ...options.list.ids,
          document.id,
        ]);
        const replacing = document.id === options.currentId;
        const opened =
          replacing && next.selectedDocumentId
            ? await editorCommand(
                { kind: "read", documentId: next.selectedDocumentId },
                "state",
              )
            : null;
        options.list.remove(document.id);
        if (replacing) options.setEditor(opened);
        options.setSnapshot(snapshot);
        options.setRemoved(document);
      }),
  };
}

async function run(options: Options, action: () => Promise<void>) {
  if (options.lock.current) return;
  options.lock.current = true;
  options.setBusy(true);
  try {
    await options.flush();
    await action();
    options.setError("");
  } catch (reason) {
    options.setError(errorMessage(reason));
  } finally {
    options.lock.current = false;
    options.setBusy(false);
  }
}
