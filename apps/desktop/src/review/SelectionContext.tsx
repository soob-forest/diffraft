export type SelectionContextData = {
  selection?: { quote: string };
  confirmed?: { version: number };
  effects?: { wholeApply: boolean };
  editableSource?: string;
  goal: string;
  pinnedRules: string;
  commonRules: string;
  summary: string;
  target: { operation: { before: string; after: string } };
  comments: { id: string; text: string }[];
  messages: { sequence: number; role: string; content: string }[];
  decisions: unknown[];
};

export function SelectionContext({
  context,
}: {
  context: SelectionContextData;
}) {
  return (
    <details>
      <summary>참고로 전달할 문맥 확인</summary>
      <p>목표: {context.goal}</p>
      <p>고정 조건: {context.pinnedRules || "없음"}</p>
      <p>공통 조건: {context.commonRules || "없음"}</p>
      <strong>참고 원문</strong>
      <pre>{context.target.operation.before}</pre>
      <strong>참고 후보</strong>
      <pre>{context.target.operation.after}</pre>
      <strong>선택한 저장 코멘트</strong>
      {context.comments.map((comment) => (
        <p key={comment.id}>{comment.text}</p>
      ))}
      <strong>작업 요약</strong>
      <p>{context.summary || "없음"}</p>
      <strong>이전 대화</strong>
      {context.messages.map((message) => (
        <p key={`${message.sequence}:${message.role}`}>
          {message.role}: {message.content}
        </p>
      ))}
      <details>
        <summary>최근 결정 {context.decisions.length}개 전달 내용</summary>
        <pre>{JSON.stringify(context.decisions, null, 2)}</pre>
      </details>
    </details>
  );
}

export function SelectionEffects({
  context,
}: {
  context: SelectionContextData;
}) {
  return (
    <>
      {context.effects && (
        <p>
          {context.effects.wholeApply
            ? "전체 재작성 후보 중 이 인용만 바꿉니다. 기존 재작성 후보는 기록으로 옮기고 새 후보는 전체 적용 또는 변경별 검토가 가능합니다."
            : "현재 확정본 기준의 새 부분 제안 묶음입니다. 기존 미승인 묶음은 유지되며 한 묶음 승인 시 다른 묶음은 기준 변경 상태가 됩니다."}
        </p>
      )}
    </>
  );
}
