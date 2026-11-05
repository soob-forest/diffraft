import { SelectionPopover } from "../editor/SelectionPopover";
import { DiffPane } from "./DiffPane";
import { TextDiff } from "./TextDiff";
import { textDiffJump } from "./text-diff-navigation";
import { type Props, useDiffViewer } from "./useDiffViewer";
export function DiffViewer(props: Props) {
  const { width, display, common, selectionPosition, closeSelection } =
    useDiffViewer(props);
  return (
    <section ref={width.ref} className="diff-viewer" aria-label="변경 비교">
      {props.tools?.compact || (
        <div className="review-tools">
          <div className="review-primary-tools">{props.tools?.header}</div>
          {props.tools?.selection}
          <DisplayToolbar display={display} />
        </div>
      )}
      {width.narrow && display.split && (
        <p className="split-guidance">
          두 열의 읽기 공간이 좁습니다.{" "}
          <button type="button" onClick={() => display.setSplit(false)}>
            인라인으로 넓게 보기
          </button>
        </p>
      )}
      <DiffPanes display={display} common={common} labels={props.labels} />
      <FoldControls display={display} />
      {selectionPosition && props.selectionTools && (
        <SelectionPopover position={selectionPosition} close={closeSelection}>
          {props.selectionTools}
        </SelectionPopover>
      )}
      {props.textDetails !== false && (
        <TextDiff
          hunks={props.projection.hunks}
          markers={common.markers}
          labels={props.labels}
          selectedGroup={props.selectedGroup}
          active={props.active}
          jump={
            props.selectedGroup ? textDiffJump(display.rows, props.jump) : null
          }
        />
      )}
    </section>
  );
}
function DisplayToolbar({
  display,
}: {
  display: ReturnType<typeof useDiffViewer>["display"];
}) {
  return (
    <div className="diff-toolbar">
      <button
        type="button"
        aria-pressed={!display.split}
        onClick={() => display.setSplit(false)}
      >
        인라인
      </button>
      <button
        type="button"
        aria-pressed={display.split}
        onClick={() => display.setSplit(true)}
      >
        나란히
      </button>
      <label>
        <input
          type="checkbox"
          checked={display.full}
          onChange={(event) => display.setFull(event.target.checked)}
        />
        전체 문맥
      </label>
      <label>
        <input
          type="checkbox"
          checked={display.whitespace}
          onChange={(event) => display.setWhitespace(event.target.checked)}
        />
        공백 표시
      </label>
      <span className="muted">− 삭제 · + 추가 · F7 다음 변경</span>
    </div>
  );
}

function FoldControls({
  display,
}: {
  display: ReturnType<typeof useDiffViewer>["display"];
}) {
  return (
    <>
      {display.rows.some((row) => row.folded > 0) && (
        <div className="diff-folds">
          {display.rows
            .filter((row) => row.folded > 0)
            .map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => display.expand(row.key)}
              >
                {row.folded}개 문맥 행 펼치기
              </button>
            ))}
        </div>
      )}
    </>
  );
}

function DiffPanes({
  display,
  common,
  labels,
}: Pick<ReturnType<typeof useDiffViewer>, "display" | "common"> &
  Pick<Props, "labels">) {
  return (
    <>
      {display.split && (
        <div className="diff-column-labels">
          <span>{labels?.[0] ?? "변경 전"}</span>
          <span>{labels?.[1] ?? "변경 후"}</span>
        </div>
      )}
      <div className={`diff-panes ${display.split ? "split" : "inline"}`}>
        {display.split ? (
          <>
            <DiffPane {...common} side="before" rows={display.before} />
            <DiffPane {...common} side="after" rows={display.after} />
          </>
        ) : (
          <DiffPane {...common} side="inline" rows={display.rows} />
        )}
      </div>
    </>
  );
}
