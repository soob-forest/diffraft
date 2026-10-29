import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { completeShutdown } from "./connection/api";
import { errorMessage } from "./ipc";

type CloseOptions = {
  lock: React.RefObject<boolean>;
  flush: () => Promise<void>;
  onError: (message: string) => void;
  onClosing: (closing: boolean) => void;
};

export function createCloseRequest(options: CloseOptions) {
  let closing = false;
  return async (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (closing) return;
    if (options.lock.current) {
      options.onError("문서 이동이 끝난 뒤 다시 종료해 주세요.");
      return;
    }
    closing = true;
    options.lock.current = true;
    options.onClosing(true);
    try {
      await options.flush();
      // Keep WKWebView alive until the application event loop exits.
      await completeShutdown();
    } catch (error) {
      options.onError(errorMessage(error));
      closing = false;
      options.lock.current = false;
      options.onClosing(false);
    }
  };
}

export function useAppClose(
  flushRef: React.RefObject<(() => Promise<void>) | null>,
  onError: CloseOptions["onError"],
  lock: CloseOptions["lock"],
  onClosing: CloseOptions["onClosing"],
) {
  useEffect(() => {
    let active = true;
    const listener = getCurrentWindow().onCloseRequested(
      createCloseRequest({
        lock,
        flush: async () => {
          await flushRef.current?.();
        },
        onError,
        onClosing,
      }),
    );
    void listener
      .then((unlisten) => {
        if (!active) unlisten();
      })
      .catch((error: unknown) => onError(errorMessage(error)));
    return () => {
      active = false;
      void listener.then(
        (unlisten) => unlisten(),
        () => {},
      );
    };
  }, [flushRef, onError, lock, onClosing]);
}
