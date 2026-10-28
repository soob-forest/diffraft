import { useState } from "react";
import type { RecoveryCopy } from "../generated/RecoveryCopy";
import { errorMessage } from "../ipc";
import { conflictCommand } from "./api";

export function RecoveryCopies({
  documentId,
  copies,
  onUse,
}: {
  documentId: string;
  copies: RecoveryCopy[];
  onUse: (content: string) => void;
}) {
  const { content, message, busy, load } = useRecoveryCopy(documentId);
  if (!copies.length) return null;
  return (
    <details className="recovery-copies">
      <summary>보존한 앱 내용·미완료 저장 {copies.length}개</summary>
      <ul>
        {copies.map((copy) => (
          <li key={`${copy.source}:${copy.id}`}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load(copy)}
            >
              {copy.source === "app_buffer" ? "앱 내용" : "미완료 저장"} ·{" "}
              {new Date(copy.createdAt).toLocaleString()} ·{" "}
              {copy.contentHash.slice(0, 8)}
            </button>
          </li>
        ))}
      </ul>
      {message && <p role="alert">{message}</p>}
      {content !== null && (
        <>
          <pre>{content}</pre>
          <button type="button" onClick={() => onUse(content)}>
            통합 편집란에 불러오기
          </button>
        </>
      )}
    </details>
  );
}

function useRecoveryCopy(documentId: string) {
  const [content, setContent] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async (copy: RecoveryCopy) => {
    setBusy(true);
    setContent(null);
    setMessage("");
    try {
      setContent(
        await conflictCommand(
          {
            kind: "recovery_copy",
            documentId,
            id: copy.id,
            source: copy.source,
          },
          "content",
        ),
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return { content, message, busy, load };
}
