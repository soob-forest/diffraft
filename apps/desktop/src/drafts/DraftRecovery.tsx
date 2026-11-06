import { useState, useSyncExternalStore } from "react";
import type { DraftPersistence } from "./persistence";

export function draftLabel(key: string) {
  const labels: Record<string, string> = {
    request: "AI 요청 초안",
    "first-request": "첫 요청 초안",
    "source-scope": "원문 선택 범위",
    "selected-request": "선택 수정 초안",
    comment: "코멘트 초안",
    candidate: "직접 수정 초안",
    regenerate: "재제안 초안",
    rewrite: "재작성 초안",
    "unit-comment": "변경 전체 코멘트 초안",
    "review-navigation": "변경 검토 보기 설정",
  };
  return (
    Object.entries(labels).find(([kind]) =>
      key.startsWith(`["${kind}",`),
    )?.[1] ?? "저장된 초안"
  );
}

type Props = { persistence: DraftPersistence };
export function DraftRecovery({ persistence }: Props) {
  const issues = useSyncExternalStore(
    persistence.subscribe,
    persistence.quarantinedDrafts,
  );
  const [busy, setBusy] = useState(false);
  const issue = issues[0];
  if (!issue) return null;
  const reset = async () => {
    setBusy(true);
    try {
      await persistence.discardQuarantined(issue);
    } catch {
      /* Persistence exposes the concrete failure without discarding the record. */
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="draft-recovery draft-quarantine"
      aria-label="저장된 초안 복구"
    >
      <span>
        초안 {issues.length}건의 복원이 보류되었습니다. 해당 입력만 잠겨 있으며
        다른 작업은 계속할 수 있습니다.
      </span>
      <details>
        <summary>{draftLabel(issue.record.key)} 원본 확인·초기화</summary>
        <p>{issue.reason}</p>
        <p>
          필요한 내용을 복사한 뒤 초기화하세요. 이 초안의 저장된 원본만
          삭제됩니다.
        </p>
        <textarea
          readOnly
          rows={4}
          aria-label="복원 보류 초안 원본"
          value={JSON.stringify(issue.record, null, 2)}
        />
        <button type="button" disabled={busy} onClick={() => void reset()}>
          {busy ? "초기화 중…" : "이 초안 원본 삭제·입력 잠금 해제"}
        </button>
      </details>
    </section>
  );
}

export function DraftLocked({ locked }: { locked: boolean }) {
  return locked ? (
    <p role="status">
      저장된 초안을 복원하지 못해 이 입력을 잠갔습니다. 화면 하단의 초안
      복구에서 원본을 확인해 주세요.
    </p>
  ) : null;
}
