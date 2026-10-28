import { Conversation } from "./Conversation";
import { RequestDialog } from "./RequestDialog";
import type { GenerationProps } from "./request";
import { useConversation } from "./useConversation";
import { useGeneration } from "./useGeneration";
import "./generation.css";

export function GenerationPanel(props: GenerationProps) {
  const conversation = useConversation(props.taskId);
  const form = useGeneration(props);
  const blocked =
    form.busy ||
    !conversation.page ||
    !conversation.generation ||
    Boolean(
      conversation.generation.operationId ||
        conversation.generation.blocked ||
        conversation.error ||
        props.model.status.error,
    );
  return (
    <section className="generation-panel" aria-label="AI 요청">
      <h3>AI 요청</h3>
      <RequestForm form={form} blocked={blocked} />
      <p className="muted">
        원문 아래에서 전체 문서·현재 섹션·선택 영역을 정하세요. 전체 재작성은
        변경 검토 화면에서 요청할 수 있습니다.
      </p>
      <p role="status">{form.message}</p>
      {conversation.error && <p role="alert">{conversation.error}</p>}
      {conversation.page && (
        <Conversation
          page={conversation.page}
          older={() => void conversation.older()}
          olderBusy={conversation.olderBusy}
          blocked={blocked}
          retry={(attempt) => void form.retry(attempt)}
        />
      )}
      {form.pending && (
        <RequestDialog
          pending={form.pending}
          busy={form.busy}
          close={form.close}
          generate={() => void form.generate()}
        />
      )}
    </section>
  );
}

function RequestForm({
  form,
  blocked,
}: {
  form: ReturnType<typeof useGeneration>;
  blocked: boolean;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.prepare();
      }}
    >
      <label>
        요청 종류
        <select
          value={form.mode}
          disabled={blocked}
          onChange={(event) =>
            form.setMode(event.target.value === "EXPLAIN" ? "EXPLAIN" : "PATCH")
          }
        >
          <option value="PATCH">수정 제안</option>
          <option value="EXPLAIN">설명만 받기</option>
        </select>
      </label>
      <label>
        요청 내용
        <textarea
          rows={4}
          value={form.instruction}
          disabled={blocked}
          required
          onChange={(event) => form.setInstruction(event.target.value)}
          placeholder="예: 수치는 유지하고 표현을 간결하게 해 주세요."
        />
      </label>
      <button type="submit" disabled={blocked || !form.instruction.trim()}>
        요청 내용 확인
      </button>
    </form>
  );
}
