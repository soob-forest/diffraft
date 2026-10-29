import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { openPreviewLink } from "../editor/api";
import type { DocumentModel } from "../editor/useDocument";
import { errorMessage } from "../ipc";
import { useExport } from "./useExport";
import "./export.css";

const Preview = lazy(() => import("../editor/Preview"));

export function ExportControls({ model }: { model: DocumentModel }) {
  const output = useExport(model);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        data-testid="export-open"
        type="button"
        disabled={output.busy}
        onClick={() => void output.open()}
      >
        확정본 내보내기
      </button>
      {!output.snapshot && output.message && (
        <span className="export-feedback" role="status">
          {output.message}
        </span>
      )}
      {output.snapshot && (
        <ExportDialog output={output} returnFocus={trigger} />
      )}
    </>
  );
}

type Output = ReturnType<typeof useExport>;
function ExportDialog({
  output,
  returnFocus,
}: {
  output: Output;
  returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      returnFocus.current?.focus();
    };
  }, [returnFocus]);
  return (
    <dialog
      ref={dialog}
      className="export-dialog"
      aria-labelledby="export-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!output.busy) output.close();
      }}
    >
      <ExportContent output={output} />
    </dialog>
  );
}

function ExportContent({ output }: { output: Output }) {
  const snapshot = output.snapshot;
  if (!snapshot) return null;
  return (
    <>
      <h2 id="export-title">v{snapshot.document.version} 확정본 내보내기</h2>
      <div className="export-layout">
        <div className="export-reading">
          <ExportPreview content={snapshot.document.content} />
        </div>
        <aside className="export-options">
          <ExportSummary output={output} />
          <ExportActions output={output} />
          <p className="export-feedback" role="status">
            {output.message}
          </p>
        </aside>
      </div>
    </>
  );
}

function ExportSummary({ output }: { output: Output }) {
  const snapshot = output.snapshot;
  if (!snapshot) return null;
  const count = snapshot.pendingGroups + snapshot.pendingRewrites;
  return (
    <>
      <h3>확정본 저장·복사</h3>
      <p>
        {count
          ? `미승인 ${count}건은 제외하고 확정본만 내보냅니다.`
          : "저장된 확정본만 내보냅니다."}{" "}
        코멘트와 대화는 포함하지 않습니다.
      </p>
      {snapshot.pendingRewrites > 0 && (
        <p>
          제외 항목: 부분 변경 {snapshot.pendingGroups}개 · 전체 재작성안{" "}
          {snapshot.pendingRewrites}개
        </p>
      )}
    </>
  );
}

function ExportActions({ output }: { output: Output }) {
  return (
    <>
      <div className="export-actions">
        <button
          className="primary"
          type="button"
          disabled={output.busy}
          onClick={() => void output.copy()}
        >
          Markdown 복사
        </button>
        <button
          type="button"
          disabled={output.busy}
          onClick={() => void output.save("copy")}
        >
          .md 사본 저장
        </button>
      </div>
      <p className="export-help">
        사본 저장은 현재 작업 파일과 기록을 유지합니다.
      </p>
      <details className="export-working">
        <summary>작업 파일 위치 변경</summary>
        <p>
          이후 편집을 새 파일에 저장합니다. 문서·작업·버전 기록과 기존 파일은
          보존합니다.
        </p>
        <button
          type="button"
          disabled={output.busy}
          onClick={() => void output.save("working_file")}
        >
          다른 이름으로 작업 파일 저장
        </button>
      </details>
      <div className="export-actions">
        <button type="button" disabled={output.busy} onClick={output.close}>
          내보내기 닫기
        </button>
      </div>
    </>
  );
}

function ExportPreview({ content }: { content: string }) {
  const [rendered, setRendered] = useState(true);
  const [error, setError] = useState("");
  return (
    <>
      <label className="export-preview-toggle">
        <input
          type="checkbox"
          checked={rendered}
          onChange={(event) => setRendered(event.target.checked)}
        />
        서식 미리보기
      </label>
      <section className="export-preview" aria-label="내보낼 확정본">
        {rendered ? (
          <Suspense fallback={<p role="status">미리보기 준비 중…</p>}>
            <Preview
              content={content}
              onOpen={(href) => {
                void openPreviewLink(href).catch((reason: unknown) =>
                  setError(errorMessage(reason)),
                );
              }}
            />
          </Suspense>
        ) : (
          <textarea
            aria-label="내보낼 Markdown 원문"
            readOnly
            value={content}
            placeholder="(빈 문서)"
          />
        )}
      </section>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
