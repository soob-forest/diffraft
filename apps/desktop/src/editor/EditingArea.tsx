import { lazy, Suspense, useDeferredValue, useState } from "react";
import type { Heading } from "../generated/Heading";
import { errorMessage } from "../ipc";
import { openPreviewLink } from "./api";
import { NavigationSlot } from "./NavigationSlots";
import { type EditorSelection, SourceEditor } from "./SourceEditor";
import type { DocumentModel } from "./useDocument";

const Preview = lazy(() => import("./Preview"));
type Jump = { offset: number; serial: number };
type Props = {
  model: DocumentModel;
  preview: boolean;
  navigationVisible: boolean;
  onSelection: (value: EditorSelection) => void;
};
export function EditingArea({
  model,
  preview,
  onSelection,
  navigationVisible,
}: Props) {
  const [jump, setJump] = useState<Jump | null>(null);
  const deferred = useDeferredValue(model.content);
  const open = (url: string) => {
    void openPreviewLink(url).catch((error: unknown) =>
      model.setError(errorMessage(error)),
    );
  };
  return (
    <div className="editing-area">
      {navigationVisible && (
        <NavigationSlot name="outline">
          <Outline headings={model.state.headings} onJump={setJump} />
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
          />
        </div>
        {preview && (
          <Suspense fallback={<p>미리보기 준비 중…</p>}>
            <Preview content={deferred} onOpen={open} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function Outline({
  headings,
  onJump,
}: {
  headings: Heading[];
  onJump: (jump: Jump) => void;
}) {
  return (
    <nav className="outline" aria-label="문서 목차">
      <strong>목차</strong>
      {headings.map((heading) => (
        <button
          type="button"
          key={heading.from}
          style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }}
          onClick={() =>
            onJump({ offset: heading.fromUtf16, serial: Date.now() })
          }
        >
          {heading.title}
        </button>
      ))}
    </nav>
  );
}
