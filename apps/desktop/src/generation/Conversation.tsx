import type { GenerationAttempt } from "../generated/GenerationAttempt";
import type { TaskConversation } from "../generated/TaskConversation";
import { failureLabel } from "./failure-label";

type Props = {
  page: TaskConversation;
  older: () => void;
  olderBusy: boolean;
  blocked: boolean;
  retry: (attempt: GenerationAttempt) => void;
};
export function Conversation(props: Props) {
  return (
    <section className="conversation" aria-label="작업 대화">
      <h3>작업 대화</h3>
      <p className="session-state">{sessionLabel(props.page.session)}</p>
      <AttemptStatus
        attempt={props.page.lastAttempt}
        blocked={props.blocked}
        retry={props.retry}
      />
      {props.page.earlierBefore && (
        <button type="button" disabled={props.olderBusy} onClick={props.older}>
          이전 대화 더 보기
        </button>
      )}
      {!props.page.messages.length && (
        <p className="muted">
          아직 대화가 없습니다. 위에서 수정이나 설명을 요청하세요.
        </p>
      )}
      <ol className="conversation-messages">
        {props.page.messages.map((message) => (
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
            <p>{message.content}</p>
          </li>
        ))}
      </ol>
      <details>
        <summary>대화 저장 안내</summary>
        <p>
          대화와 결정은 이 Mac의 앱 작업 공간에 저장합니다. 공식 CLI의 세션
          기록은 별도로 보관되며, 앱 기록이 CLI 기록을 삭제하지는 않습니다.
        </p>
      </details>
    </section>
  );
}

function sessionLabel(state: TaskConversation["session"]) {
  if (state === "CONNECTED")
    return "이 작업에 연결된 이전 AI 대화를 이어갑니다.";
  if (state === "MISSING")
    return "이전 AI 연결을 찾지 못했습니다. 다음 요청은 저장한 작업 맥락으로 새 대화를 시작합니다.";
  return "저장한 작업 맥락으로 새 AI 대화를 시작합니다.";
}

function AttemptStatus({
  attempt,
  blocked,
  retry,
}: {
  attempt: GenerationAttempt | null;
  blocked: boolean;
  retry: Props["retry"];
}) {
  if (!attempt || !["FAILED", "CANCELLED"].includes(attempt.status))
    return null;
  return (
    <div className="attempt-failure">
      <p>
        마지막 요청 {attempt.status === "CANCELLED" ? "중단됨" : "실패"} ·{" "}
        {failureLabel(attempt.errorCode)}
      </p>
      <p>
        기존 후보와 대화는 보존했습니다. 재시도는 사용 한도를 다시 소비할 수
        있습니다. 문서가 바뀌었다면 새 요청을 작성하세요.
      </p>
      <button type="button" disabled={blocked} onClick={() => retry(attempt)}>
        마지막 요청 다시 실행
      </button>
    </div>
  );
}
