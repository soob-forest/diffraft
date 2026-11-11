import { useEffect, useRef, useState } from "react";
import {
  completedDocuments,
  DocumentList,
  DocumentListError,
  visibleWorkspace,
} from "./document-list";
import { useDraftPersistence } from "./drafts/SessionDrafts";
import { editorCommand } from "./editor/api";
import type { AppSnapshot } from "./generated/AppSnapshot";
import type { DocumentSummary } from "./generated/DocumentSummary";
import type { EditorState } from "./generated/EditorState";
import { errorMessage, workspaceSnapshot } from "./ipc";
import { useAppClose } from "./useAppClose";
import { workspaceActions } from "./workspace-actions";

export function useWorkspace() {
  const { flush: flushDrafts } = useDraftPersistence();
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const lock = useRef(false);
  const [list] = useState(createDocumentList);
  const [removed, setRemoved] = useState<DocumentSummary | null>(null);
  useInitialWorkspace(setSnapshot, setEditor, setError, list);
  const actions = workspaceActions({
    lock,
    list,
    currentId: editor?.document.id,
    flush: async () => {
      await flushRef.current?.();
      await flushDrafts();
    },
    setBusy,
    setError,
    setEditor,
    setSnapshot,
    setRemoved,
  });
  useAppClose(flushRef, setError, lock, setClosing);
  return {
    snapshot: snapshot && visibleWorkspace(snapshot, list.hiddenIds),
    completed: snapshot ? completedDocuments(snapshot, list.completedIds) : [],
    editor,
    error,
    busy: busy || closing || !snapshot,
    closing,
    flushRef,
    ...actions,
    removed,
  };
}

function useInitialWorkspace(
  setSnapshot: (value: AppSnapshot) => void,
  setEditor: (value: EditorState) => void,
  setError: (message: string) => void,
  list: DocumentList,
) {
  useEffect(() => {
    let active = true;
    workspaceSnapshot()
      .then(async (value) => {
        if (!active) return;
        try {
          list.load();
        } catch (reason) {
          if (!(reason instanceof DocumentListError)) throw reason;
          setError(reason.message);
        }
        const id = visibleWorkspace(value, list.hiddenIds).selectedDocumentId;
        if (id) {
          const opened = await editorCommand(
            { kind: "read", documentId: id },
            "state",
          );
          if (!active) return;
          setEditor(opened);
        }
        if (active) setSnapshot(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [setSnapshot, setEditor, setError, list]);
}

function createDocumentList() {
  return new DocumentList({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  });
}
