import { useEffect, useMemo, useRef, useState } from "react";
import { useDraftPersistence, useSessionDraft } from "../drafts/SessionDrafts";
import type { PreparedRegeneration } from "../generated/PreparedRegeneration";
import type { PreparedSelection } from "../generated/PreparedSelection";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { errorMessage } from "../ipc";
import type { LogicalSelection } from "./coordinates";
import {
  type SelectedDraftChoice,
  selectedDraftChoices,
} from "./selected-draft-choices";
import {
  type SelectionSurface,
  selectionIndexSeed,
} from "./selected-draft-index";
import {
  type SelectedTarget,
  selectedRequestTarget,
  selectionTargetKey,
} from "./selection-targets";

export type SelectedPrepared =
  | { kind: "regenerate"; value: PreparedRegeneration }
  | { kind: "selection"; value: PreparedSelection };
export type SelectedRequestDraft = {
  instruction: string;
  target: SelectedTarget | null;
  prepared: SelectedPrepared | null;
  commentIds: string[] | null;
  replacement?: string;
};
export const EMPTY_SELECTED: SelectedRequestDraft = {
  instruction: "",
  target: null,
  prepared: null,
  commentIds: null,
};
export function useSelectedRequest(
  documentId: string,
  taskId: string,
  surface: SelectionSurface = "review",
) {
  const { store, index, draft } = useSelectedDrafts(
    documentId,
    taskId,
    surface,
  );
  const { ui, actions } = useSelectionUi(documentId, taskId);
  const { setReplacement, setActive, setMessage, setChoices } = actions;
  const adopt = selectionAdoption({ store, index }, actions);
  const beginTarget = (target: SelectedTarget) =>
    beginSelection({ draft, store, index }, target, {
      setReplacement,
      setActive,
      adopt,
    });
  const begin = selectionBeginning(beginTarget, setMessage);
  return {
    ...ui,
    draft,
    locked: index.locked || draft.locked,
    setActive,
    adopt,
    beginTarget,
    chooseDraft: (choice: SelectedDraftChoice) => {
      if (store.peek(choice.key) !== choice.value || index.locked) return;
      index.set({ instruction: "", key: choice.key });
      setChoices([]);
      setReplacement(null);
      setActive(true);
    },
    cancelReplacement: () => setReplacement(null),
    begin,
    setMessage,
  };
}

function useSelectionUi(documentId: string, taskId: string) {
  const [active, setActive] = useState(false);
  const [replacement, setReplacement] = useState<SelectedTarget | null>(null);
  const [message, setMessage] = useState("");
  const [choices, setChoices] = useState<SelectedDraftChoice[]>([]);
  const owner = JSON.stringify([documentId, taskId]);
  const previousOwner = useRef(owner);
  useEffect(() => {
    if (previousOwner.current === owner) return;
    previousOwner.current = owner;
    setActive(false);
    setReplacement(null);
    setMessage("");
    setChoices([]);
  }, [owner]);
  return {
    ui: { active, replacement, message, choices },
    actions: { setActive, setReplacement, setMessage, setChoices },
  };
}

function selectionBeginning(
  beginTarget: (target: SelectedTarget) => void,
  setMessage: (message: string) => void,
) {
  return (projection: ReviewProjection, selection: LogicalSelection | null) => {
    try {
      beginTarget(selectedRequestTarget(projection, selection));
    } catch (reason) {
      setMessage(errorMessage(reason));
    }
  };
}

function beginSelection(
  { draft, store, index }: ReturnType<typeof useSelectedDrafts>,
  target: SelectedTarget,
  actions: {
    setReplacement: (target: SelectedTarget) => void;
    setActive: (value: boolean) => void;
    adopt: (target: SelectedTarget) => void;
  },
) {
  if (
    draft.value.instruction &&
    !selectedDraftChoices(store, target).some(
      (value) => value.key === index.value.key,
    )
  ) {
    actions.setReplacement(target);
    actions.setActive(true);
  } else actions.adopt(target);
}

function selectionAdoption(
  {
    store,
    index,
  }: Pick<ReturnType<typeof useSelectedDrafts>, "store" | "index">,
  state: {
    setReplacement: (value: SelectedTarget | null) => void;
    setActive: (value: boolean) => void;
    setMessage: (value: string) => void;
    setChoices: (value: SelectedDraftChoice[]) => void;
  },
) {
  return (target: SelectedTarget) => {
    if (index.locked) {
      state.setMessage(
        "저장된 초안 복구가 필요합니다. 화면 하단을 확인해 주세요.",
      );
      return;
    }
    const choices = selectedDraftChoices(store, target);
    if (choices.length > 1) {
      state.setChoices(choices);
      state.setActive(true);
      return;
    }
    state.setChoices([]);
    const key = choices[0]?.key ?? selectionTargetKey(target);
    const value = store.read<SelectedRequestDraft>(key, EMPTY_SELECTED);
    const headChanged =
      value.target && value.target.expectedHeadId !== target.expectedHeadId;
    if (!value.target) store.write(key, { ...EMPTY_SELECTED, target });
    else if (headChanged)
      store.write(key, { ...value, target, prepared: null });
    index.set({ instruction: "", key });
    state.setReplacement(null);
    state.setActive(true);
    state.setMessage(
      headChanged
        ? "최신 확정본 기준으로 선택을 갱신했습니다. 지시는 유지되며 요청 내용을 다시 확인해 주세요."
        : "",
    );
  };
}

function useSelectedDrafts(
  documentId: string,
  taskId: string,
  surface: SelectionSurface,
) {
  const { store } = useDraftPersistence();
  const seed = useMemo(
    () => selectionIndexSeed(store, documentId, taskId, surface),
    [store, documentId, taskId, surface],
  );
  const index = useSessionDraft(seed.key, seed.initial);
  useEffect(() => {
    if (seed.migrate) store.replace(seed.key, seed.initial, seed.initial);
  }, [seed, store]);
  const draft = useSessionDraft<SelectedRequestDraft>(
    index.value.key ||
      JSON.stringify([
        "selected-request",
        documentId,
        taskId,
        `${surface}-empty`,
      ]),
    EMPTY_SELECTED,
  );
  return { store, index, draft };
}
