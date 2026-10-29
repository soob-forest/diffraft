import { useCallback, useEffect, useRef, useState } from "react";
import { editorCommand, pickDocument } from "./editor/api";
import type { AppSnapshot } from "./generated/AppSnapshot";
import type { EditorState } from "./generated/EditorState";
import { errorMessage, workspaceSnapshot } from "./ipc";
import { useAppClose } from "./useAppClose";

export function useWorkspace() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const lock = useRef(false);
  useInitialWorkspace(setSnapshot, setEditor, setError);
  const navigate = useCallback(async (target: string | boolean) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await flushRef.current?.();
      const id =
        typeof target === "string" ? target : (await pickDocument(target))?.id;
      if (id)
        setEditor(
          await editorCommand(
            { kind: "select_document", documentId: id },
            "state",
          ),
        );
      setSnapshot(await workspaceSnapshot());
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  useAppClose(flushRef, setError, lock, setClosing);
  return {
    snapshot,
    editor,
    error,
    busy: busy || closing,
    closing,
    flushRef,
    navigate,
  };
}

function useInitialWorkspace(
  setSnapshot: (value: AppSnapshot) => void,
  setEditor: (value: EditorState) => void,
  setError: (message: string) => void,
) {
  useEffect(() => {
    let active = true;
    workspaceSnapshot()
      .then(async (value) => {
        if (!active) return;
        setSnapshot(value);
        const id = value.selectedDocumentId ?? value.documents[0]?.id;
        if (id) {
          const opened = await editorCommand(
            { kind: "read", documentId: id },
            "state",
          );
          if (active) setEditor(opened);
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [setSnapshot, setEditor, setError]);
}
