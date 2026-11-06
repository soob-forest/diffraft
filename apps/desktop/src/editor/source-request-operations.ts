import type { useDraftPersistence } from "../drafts/SessionDrafts";
import type { useSelectedRequest } from "../review/useSelectedRequest";
import { activeSourceTarget } from "./source-request-store";
import {
  type CapturedSourceSelection,
  validateSourceSelection,
} from "./source-selection";
import { confirmedSourceTarget } from "./source-target";
import type {
  SourceRequestProps as Props,
  SourceSelectionAction,
} from "./useSourceRequest";

export function sourceOperations(
  state: {
    props: Props;
    drafts: ReturnType<typeof useDraftPersistence>;
    selection: ReturnType<typeof useSelectedRequest>;
    taskIdentity: React.RefObject<string>;
    captured: CapturedSourceSelection | null;
  },
  ui: {
    setVisible: (value: boolean) => void;
    setCaptured: (value: CapturedSourceSelection | null) => void;
    setPopup: (value: SourceSelectionAction | null) => void;
    setMessage: (value: string) => void;
  },
) {
  const { props, drafts, selection } = state,
    model = props.model;
  const prepare = () =>
    model.gate.run(async () => {
      await model.autosave.flush();
      await props.taskFlush.current?.();
    });
  return {
    prepare,
    open: (value: CapturedSourceSelection) =>
      openSourceSelection(state, ui, prepare, value),
    resume: () => {
      const target = activeSourceTarget(
        drafts.store,
        model.state.document.id,
        props.taskId,
      );
      if (!target) return false;
      ui.setCaptured({
        source: target.candidate,
        quote: target.selection.quote,
        selection: {
          from: target.selection.fromUtf16,
          to: target.selection.toUtf16,
          cursor: target.selection.toUtf16,
        },
      });
      ui.setVisible(true);
      selection.setActive(true);
      props.show();
      return true;
    },
  };
}

async function openSourceSelection(
  state: Parameters<typeof sourceOperations>[0],
  ui: Parameters<typeof sourceOperations>[1],
  prepare: () => Promise<void>,
  value: CapturedSourceSelection,
) {
  const { props, selection } = state;
  validateSourceSelection(value, props.model.content);
  await prepare();
  ui.setCaptured(value);
  ui.setPopup(null);
  ui.setVisible(true);
  props.show();
  if (props.taskId)
    selection.beginTarget(
      confirmedSourceTarget(props.model.autosave.document, props.taskId, value),
    );
}
