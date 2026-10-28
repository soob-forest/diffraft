import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { shutdownGeneration } from "./connection/api";
import { editorCommand, pickDocument } from "./editor/api";
import type { AppSnapshot } from "./generated/AppSnapshot";
import type { EditorState } from "./generated/EditorState";
import { errorMessage, workspaceSnapshot } from "./ipc";

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
  useClose(flushRef, setError, lock, setClosing);
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

function useClose(
  flushRef: React.RefObject<(() => Promise<void>) | null>,
  setError: (message: string) => void,
  lock: React.RefObject<boolean>,
  setClosing: (closing: boolean) => void,
) {
  useEffect(() => {
    let active = true;
    let closing = false;
    const window = getCurrentWindow();
    const listener = window.onCloseRequested(async (event) => {
      event.preventDefault();
      if (closing) return;
      if (lock.current) {
        setError("문서 이동이 끝난 뒤 다시 종료해 주세요.");
        return;
      }
      closing = true;
      lock.current = true;
      setClosing(true);
      try {
        await flushRef.current?.();
        await shutdownGeneration();
        await window.destroy();
      } catch (error) {
        setError(errorMessage(error));
        closing = false;
        lock.current = false;
        setClosing(false);
      }
    });
    void listener
      .then((unlisten) => {
        if (!active) unlisten();
      })
      .catch((error: unknown) => setError(errorMessage(error)));
    return () => {
      active = false;
      void listener.then(
        (unlisten) => unlisten(),
        () => {},
      );
    };
  }, [flushRef, setError, lock, setClosing]);
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
