import type { ConversationResult } from "../generated/ConversationResult";
import type { GenerationAttempt } from "../generated/GenerationAttempt";
import type { TaskConversation } from "../generated/TaskConversation";
import { questionDestination } from "../review/result-destination";
import { AttemptRecovery } from "./AttemptRecovery";
import { QuestionTarget } from "./QuestionTarget";
import "./conversation-layout.css";

type Props = {
  page: TaskConversation;
  older: () => void;
  olderBusy: boolean;
  blocked: boolean;
  retry: (attempt: GenerationAttempt) => void;
  edit: (attempt: GenerationAttempt) => void;
  onResult?: (result: ConversationResult) => void;
};
export function Conversation(props: Props) {
  return (
    <section className="conversation" aria-label="작업 대화">
      <div className="conversation-heading">
        <h3>작업 대화</h3>
        <ConversationPrivacy />
      </div>
      <p className="session-state">
        {props.page.messages.length
          ? sessionLabel(props.page.session)
          : "이 작업의 요청과 응답을 이어서 확인합니다."}
      </p>
      <AttemptRecovery
        attempt={props.page.lastAttempt}
        blocked={props.blocked}
        retry={props.retry}
        edit={props.edit}
      />
      {props.page.earlierBefore && (
        <button type="button" disabled={props.olderBusy} onClick={props.older}>
          이전 대화 더 보기
        </button>
      )}
      <ConversationMessages
        messages={props.page.messages}
        onResult={props.onResult}
      />
    </section>
  );
}

function ConversationMessages({
  messages,
  onResult,
}: {
  messages: TaskConversation["messages"];
  onResult?: Props["onResult"];
}) {
  return (
    <ol className="conversation-messages">
      {messages.map((message) => (
        <li key={message.id}>
          <strong>
            {message.role === "USER"
              ? "나"
              : message.role === "ASSISTANT"
                ? "AI"
                : "작업 기록"}
          </strong>
          <time dateTime={new Date(message.createdAt).toISOString()}>
            {new Date(message.createdAt).toLocaleString()}
          </time>
          {message.question && <QuestionTarget question={message.question} />}
          <QuestionResult message={message} onResult={onResult} />
          <p>{message.content}</p>
          {message.result && (
            <div>
              <span>현재 상태: {resultLabel(message.result.status)}</span>{" "}
              {message.result.status !== "UNCHANGED" && onResult && (
                <button
                  type="button"
                  onClick={() => {
                    if (message.result) onResult(message.result);
                  }}
                >
                  이 요청의 변경 보기
                  {message.result.revision && message.result.revision > 1
                    ? ` · 수정안 ${message.result.revision}`
                    : ""}
                </button>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function resultLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "검토 중",
    ACCEPTED: "승인됨",
    REJECTED: "거절됨",
    SUPERSEDED: "새 후보로 교체됨",
    STALE: "최신 기준 요청 필요",
    CONFLICT: "범위 확인 필요",
    ARCHIVED: "이전 기록",
    DISCARDED: "취소됨",
    APPLIED: "전체 적용됨",
    COMPLETED: "검토 완료",
    UNCHANGED: "변경 없음",
  };
  return labels[status] ?? "상태 확인 필요";
}

function ConversationPrivacy() {
  return (
    <details className="conversation-privacy">
      <summary>대화 저장 안내</summary>
      <p>
        대화와 결정은 이 Mac의 앱 작업 공간에 저장합니다. 공식 CLI의 세션 기록은
        별도로 보관되며, 앱 기록이 CLI 기록을 삭제하지는 않습니다.
      </p>
    </details>
  );
}

function sessionLabel(state: TaskConversation["session"]) {
  if (state === "CONNECTED")
    return "이 작업에 연결된 이전 AI 대화를 이어갑니다.";
  if (state === "MISSING")
    return "이전 AI 연결을 찾지 못했습니다. 다음 요청은 저장한 작업 맥락으로 새 대화를 시작합니다.";
  return "저장한 작업 맥락으로 새 AI 대화를 시작합니다.";
}

function QuestionResult({
  message,
  onResult,
}: {
  message: TaskConversation["messages"][number];
  onResult?: Props["onResult"];
}) {
  return (
    <>
      {" "}
      {message.question && onResult && (
        <button
          type="button"
          onClick={() => {
            const q = message.question;
            if (q) onResult(questionDestination(q));
          }}
        >
          질문한 제안 보기
        </button>
      )}
    </>
  );
}
