import { RequestModelSummary } from "../connection/RequestModelSummary";
import { DraftStatus } from "../drafts/SessionDrafts";
import { QuotePreview } from "./QuotePreview";
import { selectionCharacterCount } from "./selection-count";
import type { Panel } from "./useReviewPanel";
import type { useSelectedRequest } from "./useSelectedRequest";

export function SelectedFields({
  selection,
  comments = [],
  busy,
  canPrepare = true,
  prepare,
}: {
  selection: ReturnType<typeof useSelectedRequest>;
  comments?: Panel["review"]["state"]["comments"];
  busy: boolean;
  canPrepare?: boolean;
  prepare: () => void;
}) {
  const draft = selection.draft,
    value = draft.value,
    target = value.target;
  if (!target) return null;
  const update = (instruction: string) =>
    draft.set({ ...value, instruction, prepared: null });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        prepare();
      }}
    >
      <SelectedScope target={target} />
      <label>
        수정 지시
        <textarea
          required
          rows={4}
          value={value.instruction}
          disabled={busy}
          onChange={(event) => update(event.target.value)}
        />
      </label>
      <InstructionSuggestions busy={busy} update={update} />
      <SelectedComments selection={selection} comments={comments} busy={busy} />
      <DraftStatus />
      <RequestModelSummary />
      <button
        type="submit"
        className="primary"
        disabled={busy || !canPrepare || !value.instruction.trim()}
      >
        {busy ? "요청 처리 중…" : "요청 내용 확인"}
      </button>
    </form>
  );
}
function SelectedComments({
  selection,
  comments: allComments,
  busy,
}: {
  selection: ReturnType<typeof useSelectedRequest>;
  comments: Panel["review"]["state"]["comments"];
  busy: boolean;
}) {
  const draft = selection.draft,
    value = draft.value;
  const target = value.target;
  if (target?.kind !== "candidate") return null;
  const comments = allComments.filter(
    (comment) =>
      comment.proposalId === target.proposalId &&
      comment.taskId === target.selection.taskId,
  );
  const selected = value.commentIds ?? comments.map((comment) => comment.id);
  return (
    <details>
      <summary>함께 전달할 저장 코멘트 · {selected.length}개</summary>
      {comments.length ? (
        comments.map((comment) => (
          <label key={comment.id}>
            <input
              type="checkbox"
              disabled={busy}
              checked={selected.includes(comment.id)}
              onChange={(event) =>
                draft.set({
                  ...value,
                  prepared: null,
                  commentIds: event.target.checked
                    ? [...selected, comment.id]
                    : selected.filter((id) => id !== comment.id),
                })
              }
            />
            {comment.text}
          </label>
        ))
      ) : (
        <p>저장된 코멘트가 없습니다. 코멘트 없이 요청할 수 있습니다.</p>
      )}
    </details>
  );
}

function SelectedScope({
  target,
}: {
  target: import("./selection-targets").SelectedTarget;
}) {
  return (
    <>
      <p>{target.title}</p>
      <p className="selected-scope-badge">
        {target.kind === "confirmed"
          ? `원문${target.sourceVersion ? ` · v${target.sourceVersion}` : " · 확정본 기준"}`
          : target.kind === "rewrite"
            ? "전체 재작성 후보"
            : `제안 내용 · r${target.expectedRevision}`}{" "}
        · 선택한 {selectionCharacterCount(target.selection.quote)}자 · 대상 고정
      </p>
      <QuotePreview text={target.selection.quote} label="수정할 인용" />
      <p>
        {target.kind === "rewrite"
          ? "이 부분만 다듬은 새 전체 후보입니다. 확정본 반영은 전체 적용으로 진행합니다."
          : target.kind === "confirmed"
            ? "현재 확정본 기준의 새 부분 제안입니다. 기존 미승인 묶음은 유지됩니다. 한 묶음을 승인하면 다른 묶음의 기준은 변경됩니다."
            : "이 부분만 다시 다듬습니다. 확정본 반영은 연결된 변경 그룹 단위입니다."}
      </p>
    </>
  );
}

function InstructionSuggestions({
  busy,
  update,
}: {
  busy: boolean;
  update: (value: string) => void;
}) {
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          update("수치와 의미를 유지하고 더 간결하게 다듬어 주세요.")
        }
      >
        간결하게
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => update("의미와 수치를 유지하고 더 쉽게 설명해 주세요.")}
      >
        더 쉽게
      </button>
    </div>
  );
}
