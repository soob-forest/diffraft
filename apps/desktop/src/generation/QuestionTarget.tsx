import type { ChangeQuestion } from "../generated/ChangeQuestion";
export function QuestionTarget({ question }: { question: ChangeQuestion }) {
  return (
    <section className="question-target" aria-label="질문 대상">
      <strong>
        질문 대상 · {question.label}의 수정안
        {question.subject.kind !== "whole" && question.subject.revision > 1
          ? ` ${question.subject.revision}`
          : ""}
      </strong>
      <p>
        이 변경의 전후 내용을 고정해 전달합니다. 답변은 검토 참고 정보이며
        승인·수정은 실행하지 않습니다.
      </p>
      <details>
        <summary>전달할 변경 내용</summary>
        {question.changes.map((change) => (
          <div key={change.id}>
            <h4>변경 전</h4>
            <pre>{change.before || "(없음)"}</pre>
            <h4>수정안</h4>
            <pre>{change.after || "(없음)"}</pre>
          </div>
        ))}
      </details>
    </section>
  );
}
