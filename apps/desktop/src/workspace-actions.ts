import {
  type DocumentList,
  DocumentListError,
  visibleWorkspace,
} from "./document-list";
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
        const warning = navigationListWarning(options.list);
        const previousId =
          options.currentId ?? (await workspaceSnapshot()).selectedDocumentId;
        const id =
          typeof target === "string"
            ? target
            : (await pickDocument(target))?.id;
        if (!id) return warning;
        const opened = await editorCommand(
          { kind: "select_document", documentId: id },
          "state",
        );
        let snapshot: AppSnapshot;
        try {
          snapshot = await workspaceSnapshot();
          if (!warning) options.list.restore(id);
        } catch (reason) {
          await restoreSelection(previousId, reason);
          throw reason;
        }
        options.setEditor(opened);
        options.setSnapshot(snapshot);
        options.setRemoved(null);
        if (warning)
          return `${warning} 목록 상태를 바꾸지 않고 문서를 열었습니다. 목록 설정을 복구한 뒤 상태 변경을 다시 시도해 주세요.`;
        return "";
      }),
    forget: (document: DocumentSummary) =>
      run(options, () => forgetDocument(options, document)),
    complete: (document: DocumentSummary) =>
      run(options, () => completeDocument(options, document)),
  };
}

function navigationListWarning(list: DocumentList) {
  try {
    list.ensureLoaded();
    return "";
  } catch (reason) {
    if (!(reason instanceof DocumentListError)) throw reason;
    return reason.message;
  }
}

async function restoreSelection(id: string | null, original: unknown) {
  if (!id) return;
  try {
    await editorCommand({ kind: "select_document", documentId: id }, "state");
  } catch (reason) {
    throw new Error(
      `${errorMessage(original)} 이전 문서 선택도 복구하지 못했습니다: ${errorMessage(reason)} 문서를 다시 선택해 주세요.`,
    );
  }
}

async function completeDocument(options: Options, document: DocumentSummary) {
  options.list.ensureLoaded();
  const snapshot = await workspaceSnapshot();
  const next = await editorAfterHiding(options, snapshot, [
    ...options.list.hiddenIds,
    document.id,
  ]);
  options.list.complete(document.id);
  if (next.replacing) options.setEditor(next.editor);
  options.setSnapshot(snapshot);
  options.setRemoved(document);
  return "";
}

async function forgetDocument(options: Options, document: DocumentSummary) {
  options.list.ensureLoaded();
  const snapshot = await workspaceSnapshot();
  const next = await editorAfterHiding(
    options,
    snapshot,
    options.list.hiddenIds,
  );
  options.list.forget(document.id);
  if (next.replacing) options.setEditor(next.editor);
  options.setSnapshot(snapshot);
  options.setRemoved(null);
  return "";
}

async function editorAfterHiding(
  options: Options,
  snapshot: AppSnapshot,
  hiddenIds: string[],
) {
  const next = visibleWorkspace(
    {
      ...snapshot,
      selectedDocumentId: options.currentId ?? snapshot.selectedDocumentId,
    },
    hiddenIds,
  );
  const replacing = next.selectedDocumentId !== options.currentId;
  const editor =
    replacing && next.selectedDocumentId
      ? await editorCommand(
          { kind: "read", documentId: next.selectedDocumentId },
          "state",
        )
      : null;
  return { replacing, editor };
}

async function run(options: Options, action: () => Promise<string>) {
  if (options.lock.current) return false;
  options.lock.current = true;
  options.setBusy(true);
  try {
    await options.flush();
    const warning = await action();
    options.setError(warning);
    return true;
  } catch (reason) {
    options.setError(errorMessage(reason));
    return false;
  } finally {
    options.lock.current = false;
    options.setBusy(false);
  }
}
