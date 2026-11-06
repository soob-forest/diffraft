import { useEffect, useRef } from "react";
import type { useSessionDraft } from "../drafts/SessionDrafts";
import { errorMessage } from "../ipc";
import type { SelectedRequestDraft } from "./useSelectedRequest";

type Draft = Pick<
  ReturnType<typeof useSessionDraft<SelectedRequestDraft>>,
  "value" | "replace" | "flush"
>;
type Options = {
  draft: Draft;
  read: () => SelectedRequestDraft;
  close: () => void;
  isCurrent: () => boolean;
};
export async function dismissSelectedDraft({
  draft,
  read,
  close,
  isCurrent,
}: Options) {
  const submitted = read();
  await draft.flush();
  if (!isCurrent() || read() !== submitted) return false;
  if (!submitted.target) {
    close();
    return true;
  }
  const next = { ...submitted, prepared: null, prepareOnOpen: false };
  draft.replace(submitted, next);
  await draft.flush();
  if (!isCurrent() || read() !== next) return false;
  close();
  return true;
}
export function useSelectedDismissal(
  draft: Draft,
  state: {
    setActive: (value: boolean) => void;
    setReplacement: (value: null) => void;
    setChoices: (value: []) => void;
    setMessage: (value: string) => void;
  },
  owner: string,
  read: () => SelectedRequestDraft,
) {
  const current = useRef(owner),
    closing = useRef(false);
  current.current = owner;
  useEffect(() => {
    current.current = owner;
    return () => {
      current.current = "";
    };
  }, [owner]);
  return async () => {
    if (closing.current) return false;
    closing.current = true;
    try {
      return await dismissSelectedDraft({
        draft,
        read,
        isCurrent: () => current.current === owner,
        close: () => {
          state.setActive(false);
          state.setReplacement(null);
          state.setChoices([]);
        },
      });
    } catch (reason) {
      if (current.current === owner) state.setMessage(errorMessage(reason));
      return false;
    } finally {
      closing.current = false;
    }
  };
}
