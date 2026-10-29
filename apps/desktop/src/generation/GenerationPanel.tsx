import { type ReactNode, useEffect, useState } from "react";
import { ScopeBar } from "../editor/ScopeBar";
import { Conversation } from "./Conversation";
import { RequestDialog } from "./RequestDialog";
import { RequestForm } from "./RequestForm";
import type { GenerationProps } from "./request";
import { useConversation } from "./useConversation";
import { useGeneration } from "./useGeneration";
import "./generation.css";

type Props = GenerationProps & { children?: ReactNode };
export function GenerationPanel(props: Props) {
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
      {props.children}
      <h3>AI 요청</h3>
      <RequestForm form={form} blocked={blocked}>
        <ScopeBar model={props.model} requestScope={props.scope} />
      </RequestForm>
      <RequestFeedback
        props={props}
        form={form}
        blocked={blocked}
        conversation={conversation}
      />
      <RequestExtras
        warning={Boolean(conversation.page?.lastAttempt?.errorCode)}
      >
        <RequestNotices props={props} />
        <RequestConversation
          conversation={conversation}
          form={form}
          blocked={blocked}
        />
      </RequestExtras>
      <RequestConfirmation form={form} />
    </section>
  );
}

function RequestConversation({
  form,
  conversation,
  blocked,
}: {
  form: ReturnType<typeof useGeneration>;
  conversation: ReturnType<typeof useConversation>;
  blocked: boolean;
}) {
  return (
    <>
      {conversation.page && (
        <Conversation
          page={conversation.page}
          older={() => void conversation.older()}
          olderBusy={conversation.olderBusy}
          blocked={blocked}
          retry={(attempt) => void form.retry(attempt)}
          edit={form.edit}
        />
      )}
    </>
  );
}

function RequestNotices({ props }: { props: GenerationProps }) {
  return (
    <>
      <p className="muted">
        확인 후 요청합니다. 승인 전에는 원문을 바꾸지 않습니다.
      </p>
      <button type="button" className="rewrite-entry" onClick={props.onRewrite}>
        전체 재작성으로 이동
      </button>
    </>
  );
}

function RequestFeedback({
  props,
  form,
  blocked,
  conversation,
}: {
  props: GenerationProps;
  form: ReturnType<typeof useGeneration>;
  blocked: boolean;
  conversation: ReturnType<typeof useConversation>;
}) {
  return (
    <>
      <p role="status">{form.message}</p>
      {conversation.error && <p role="alert">{conversation.error}</p>}
      {blocked && (
        <p role="status">
          {props.model.status.error
            ? "원문 저장 오류를 해결한 뒤 다시 요청해 주세요."
            : conversation.generation?.operationId
              ? "진행 중인 요청을 기다리거나 상단에서 중단해 주세요."
              : conversation.generation?.blocked
                ? conversation.generation.blocked
                : conversation.error || "작업과 요청 상태를 확인하는 중입니다."}
        </p>
      )}
      <ImportedRequest form={form} />
    </>
  );
}

function RequestExtras({
  children,
  warning,
}: {
  children: ReactNode;
  warning: boolean;
}) {
  const [expanded, setExpanded] = useState(innerWidth > 1000);
  useEffect(() => {
    if (warning) setExpanded(true);
  }, [warning]);
  useEffect(() => {
    const query = matchMedia("(max-width: 1000px)");
    const update = () => setExpanded(!query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return (
    <details
      className="request-extras"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>작업 대화·추가 요청</summary>
      {children}
    </details>
  );
}

function RequestConfirmation({
  form,
}: {
  form: ReturnType<typeof useGeneration>;
}) {
  return (
    <>
      {form.pending && (
        <RequestDialog
          pending={form.pending}
          busy={form.busy}
          close={form.close}
          generate={() => void form.generate()}
        />
      )}
    </>
  );
}

function ImportedRequest({ form }: { form: ReturnType<typeof useGeneration> }) {
  return (
    <>
      {form.imported !== null && (
        <div className="attempt-failure">
          <p>
            작성 중인 초안이 있습니다. 이전 지시로 바꿀까요? 원문·조건·범위는
            새로 확인합니다.
          </p>
          <button type="button" onClick={form.applyImport}>
            이전 지시 가져오기
          </button>
          <button type="button" onClick={form.discardImport}>
            현재 초안 유지
          </button>
        </div>
      )}
    </>
  );
}
