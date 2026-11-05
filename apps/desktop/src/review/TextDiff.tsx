import { useMemo, useState } from "react";
import type { DiffHunk } from "../generated/DiffHunk";
import type { GroupMark } from "./group-selection";
import {
  changedTextLines,
  textDiffLine,
  textDiffPage,
} from "./text-diff-model";
import {
  reconcileTextPage,
  selectedTextPages,
  type TextDiffJump,
  type TextPageState,
  textJumpPage,
} from "./text-diff-navigation";
import { useTextDiffReveal } from "./text-diff-reveal";
import "./text-diff.css";

type Props = {
  hunks: DiffHunk[];
  markers?: Map<string, GroupMark>;
  labels?: [string, string];
  selectedGroup?: string;
  jump?: TextDiffJump | null;
  active?: boolean;
};
export function TextDiff(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="text-diff"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>텍스트로 변경 읽기</summary>
      {open && <TextDiffPages {...props} />}
    </details>
  );
}

export function TextDiffPages(props: Props) {
  const { labels, markers } = props;
  const { current, selected, setPage, readSelected, reveal } =
    useTextPage(props);
  const rows = useTextDiffReveal(reveal, props.active);
  return (
    <>
      {labels && (
        <p className="text-diff-basis">
          {labels[0]} → {labels[1]}
        </p>
      )}
      {markers && props.selectedGroup !== undefined && (
        <TextSelectionNotice
          selected={selected}
          selectedGroup={props.selectedGroup}
          page={current.page}
          readSelected={readSelected}
        />
      )}
      {!current.total ? (
        <p>변경된 행이 없습니다.</p>
      ) : (
        <>
          <TextDiffRows page={current} markers={markers} rows={rows} />
          <TextDiffNavigation page={current} setPage={setPage} />
        </>
      )}
    </>
  );
}

function useTextPage({ hunks, markers, selectedGroup, jump }: Props) {
  const lines = useMemo(() => changedTextLines(hunks), [hunks]);
  const selected = selectedTextPages(lines, markers, selectedGroup);
  const [state, setState] = useState<TextPageState>({ page: 0 });
  const navigation = reconcileTextPage(state, {
    selectedGroup,
    selectedPage: selected.pages[0] ?? null,
    selectedRowKey: selected.firstKey,
    jump,
    jumpPage: textJumpPage(lines, markers, selectedGroup, jump),
  });
  if (navigation !== state) setState(navigation);
  return {
    selected,
    reveal: navigation.reveal,
    current: textDiffPage(lines, navigation.page),
    setPage: (page: number) =>
      setState((value) => ({ ...value, page, reveal: null })),
    readSelected: () =>
      setState((value) => ({
        ...value,
        page: selected.pages[0] ?? 0,
        reveal: selected.firstKey ? { rowKey: selected.firstKey } : null,
      })),
  };
}

function TextSelectionNotice({
  selected,
  selectedGroup,
  page,
  readSelected,
}: {
  selected: ReturnType<typeof selectedTextPages>;
  selectedGroup?: string;
  page: number;
  readSelected: () => void;
}) {
  if (!selectedGroup) return <p role="status">선택한 변경이 없습니다.</p>;
  if (!selected.pages.length)
    return <p role="status">선택한 변경은 이 비교에 변경 행이 없습니다.</p>;
  if (selected.pages.includes(page)) return null;
  return (
    <p role="status">
      선택한 {selected.title}이 현재 텍스트 페이지 밖에 있습니다.{" "}
      <button type="button" onClick={readSelected}>
        선택한 변경 읽기
      </button>
    </p>
  );
}

function TextDiffRows({
  page,
  markers,
  rows,
}: {
  page: ReturnType<typeof textDiffPage>;
  markers?: Map<string, GroupMark>;
  rows: React.RefObject<HTMLOListElement | null>;
}) {
  return (
    <>
      <p role="status">
        변경 행 {page.start + 1}–{page.end} / 총 {page.total}개
      </p>
      <ol ref={rows} start={page.start + 1} aria-label="삭제와 추가된 행">
        {page.lines.map((line) => {
          const row = textDiffLine(line, markers);
          return (
            <li key={row.key} data-row-key={row.key}>
              <strong>{row.label}</strong>
              <pre>{row.text}</pre>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function TextDiffNavigation({
  page,
  setPage,
}: {
  page: ReturnType<typeof textDiffPage>;
  setPage: (page: number) => void;
}) {
  return (
    <nav aria-label="텍스트 변경 목록 페이지">
      <button
        type="button"
        disabled={page.page === 0}
        onClick={() => setPage(page.page - 1)}
      >
        이전 변경 행
      </button>
      <button
        type="button"
        disabled={page.page === page.lastPage}
        onClick={() => setPage(page.page + 1)}
      >
        다음 변경 행
      </button>
    </nav>
  );
}
