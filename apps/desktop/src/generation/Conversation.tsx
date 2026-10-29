import type { GenerationAttempt } from "../generated/GenerationAttempt";
import type { TaskConversation } from "../generated/TaskConversation";
import { AttemptRecovery } from "./AttemptRecovery";
import "./conversation-layout.css";

type Props = {
  page: TaskConversation;
  older: () => void;
  olderBusy: boolean;
  blocked: boolean;
  retry: (attempt: GenerationAttempt) => void;
  edit: (attempt: GenerationAttempt) => void;
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
      <ConversationMessages messages={props.page.messages} />
    </section>
  );
}

function ConversationMessages({
  messages,
}: {
  messages: TaskConversation["messages"];
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
          <p>{message.content}</p>
        </li>
      ))}
    </ol>
  );
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
