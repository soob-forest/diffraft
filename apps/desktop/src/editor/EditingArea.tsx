import { lazy, Suspense, useDeferredValue, useState } from "react";
import { errorMessage } from "../ipc";
import { openPreviewLink } from "./api";
import { DocumentOutline } from "./DocumentOutline";
import { NavigationSlot, useNavigationVisibility } from "./NavigationSlots";
import type { PreviewJump } from "./preview-navigation";
import { type EditorSelection, SourceEditor } from "./SourceEditor";
import type { SourceEditorAction } from "./source-editor-actions";
import type { DocumentModel } from "./useDocument";

const Preview = lazy(() => import("./Preview"));
type Props = {
  model: DocumentModel;
  preview: boolean;
  navigationVisible: boolean;
  onSelection: (value: EditorSelection) => void;
  action?: SourceEditorAction;
};
export function EditingArea(props: Props) {
  const { model, preview, onSelection, navigationVisible, action } = props;
  const [jump, setJump] = useState<PreviewJump | null>(null);
  const [previewJump, setPreviewJump] = useState<PreviewJump | null>(null);
  const deferred = useDeferredValue(model.content);
  const navigation = useNavigationVisibility();
  const open = (url: string) => {
    void openPreviewLink(url).catch((error: unknown) =>
      model.setError(errorMessage(error)),
    );
  };
  return (
    <div className="editing-area">
      {navigationVisible && navigation.open && (
        <NavigationSlot>
          <DocumentOutline
            content={deferred}
            disabled={deferred !== model.content}
            onJump={preview ? setPreviewJump : setJump}
          />
        </NavigationSlot>
      )}
      <div className="editor-panes">
        <div className="source-pane" hidden={preview}>
          <SourceEditor
            key={model.editorEpoch}
            initial={model.editorInitial}
            onChange={model.change}
            onComposition={(active) => model.autosave.composition(active)}
            onSelection={onSelection}
            jump={jump}
            action={action}
          />
        </div>
        {preview && (
          <PreviewPane
            content={deferred}
            onOpen={open}
            jump={previewJump}
            handled={() => setPreviewJump(null)}
          />
        )}
      </div>
    </div>
  );
}

function PreviewPane({
  content,
  onOpen,
  jump,
  handled,
}: {
  content: string;
  onOpen: (url: string) => void;
  jump: PreviewJump | null;
  handled: () => void;
}) {
  return (
    <Suspense fallback={<p>미리보기 준비 중…</p>}>
      <Preview
        content={content}
        onOpen={onOpen}
        jump={jump}
        onJumpHandled={handled}
      />
    </Suspense>
  );
}
