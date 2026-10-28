import { useMemo, useState } from "react";
import type { DiffHunk } from "../generated/DiffHunk";
import type { DiffLine } from "../generated/DiffLine";
import { displayLine } from "./rows";
import "./text-diff.css";

const PAGE_SIZE = 50;

export function TextDiff({ hunks }: { hunks: DiffHunk[] }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="text-diff"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>텍스트로 변경 읽기</summary>
      {open && <TextDiffPages hunks={hunks} />}
    </details>
  );
}

function TextDiffPages({ hunks }: { hunks: DiffHunk[] }) {
  const [page, setPage] = useState(0);
  const lines = useMemo(
    () =>
      hunks.flatMap((hunk) =>
        hunk.lines.filter(
          (line) => line.kind === "delete" || line.kind === "insert",
        ),
      ),
    [hunks],
  );
  const lastPage = Math.max(0, Math.ceil(lines.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * PAGE_SIZE;
  if (!lines.length) return <p>변경된 행이 없습니다.</p>;
  return (
    <>
      <p role="status">
        변경 행 {start + 1}–{Math.min(start + PAGE_SIZE, lines.length)} / 총{" "}
        {lines.length}개
      </p>
      <ol start={start + 1} aria-label="삭제와 추가된 행">
        {lines.slice(start, start + PAGE_SIZE).map((line) => (
          <TextDiffLine
            key={`${line.kind}:${line.oldLine}:${line.newLine}`}
            line={line}
          />
        ))}
      </ol>
      <nav aria-label="텍스트 변경 목록 페이지">
        <button
          type="button"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          이전 변경 행
        </button>
        <button
          type="button"
          disabled={currentPage === lastPage}
          onClick={() => setPage(currentPage + 1)}
        >
          다음 변경 행
        </button>
      </nav>
    </>
  );
}

function TextDiffLine({ line }: { line: DiffLine }) {
  const label =
    line.kind === "delete"
      ? `삭제 · 변경 전 ${line.oldLine}행`
      : `추가 · 변경 후 ${line.newLine}행`;
  const text = displayLine(
    line.segments.map((segment) => segment.text).join(""),
  );
  return (
    <li>
      <strong>{label}</strong>
      <pre>{text || "(빈 행)"}</pre>
    </li>
  );
}
