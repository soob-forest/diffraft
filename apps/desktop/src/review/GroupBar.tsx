import { useEffect, useRef } from "react";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { DetailEntry } from "./DetailEntry";
import type { Panel } from "./useReviewPanel";

const MAX_VISIBLE_GROUP_BUTTONS = 5;
export function GroupBar({
  panel,
  projection,
}: {
  panel: Panel;
  projection: ReviewProjection;
}) {
  return (
    <div className="group-bar">
      <SelectedGroup panel={panel} projection={projection} />
      <GroupCompletion remaining={projection.groups.length} />
    </div>
  );
}
function GroupCompletion({ remaining }: { remaining: number }) {
  const status = useRef<HTMLParagraphElement>(null);
  const hadPending = useRef(remaining > 0);
  useEffect(() => {
    if (hadPending.current && !remaining) status.current?.focus();
    hadPending.current = remaining > 0;
  }, [remaining]);
  return remaining ? null : (
    <p role="status" ref={status} tabIndex={-1}>
      유효한 미처리 변경이 없습니다. 변경 상세의 처리·이전 기록에서 확인하세요.
    </p>
  );
}
export function GroupNavigation({
  panel,
  projection,
}: {
  panel: Panel;
  projection: ReviewProjection;
}) {
  if (projection.groups.length > MAX_VISIBLE_GROUP_BUTTONS)
    return (
      <label>
        변경 이동
        <select
          aria-label="변경 그룹 선택"
          value={panel.selected?.id ?? ""}
          onChange={(event) => {
            const group = projection.groups.find(
              (value) => value.id === event.target.value,
            );
            if (group) panel.choose(group);
          }}
        >
          {projection.groups.map((group, index) => (
            <option key={group.id} value={group.id}>
              {index + 1}번 변경 ·{" "}
              {projection.batch.proposals
                .find((proposal) => proposal.id === group.proposals[0]?.id)
                ?.operation.headingPath.join(" › ") || "문서"}
            </option>
          ))}
        </select>
      </label>
    );
  return <GroupButtons panel={panel} projection={projection} />;
}
function GroupButtons({
  panel,
  projection,
}: {
  panel: Panel;
  projection: ReviewProjection;
}) {
  return (
    <nav aria-label="변경 그룹">
      <h3>변경 탐색</h3>
      {projection.groups.map((group, index) => (
        <div className="change-nav-item" key={group.id}>
          <button
            type="button"
            aria-pressed={panel.selected?.id === group.id}
            title={projection.batch.proposals
              .find((p) => p.id === group.proposals[0]?.id)
              ?.operation.headingPath.join(" › ")}
            onClick={() => panel.choose(group)}
          >
            {index + 1}번 변경
            {group.proposals.length > 1
              ? ` · ${group.proposals.length}개 결합`
              : ""}
          </button>
          <span>
            {projection.batch.proposals
              .find((p) => p.id === group.proposals[0]?.id)
              ?.operation.headingPath.join(" › ") || "문서"}
          </span>
        </div>
      ))}
    </nav>
  );
}

function SelectedGroup({
  panel,
  projection,
}: {
  panel: Panel;
  projection: ReviewProjection;
}) {
  const group = panel.selected;
  const title = useRef<HTMLHeadingElement>(null);
  const previous = useRef(group?.id);
  useEffect(() => {
    if (
      previous.current &&
      previous.current !== group?.id &&
      !projection.groups.some((value) => value.id === previous.current)
    )
      title.current?.focus();
    previous.current = group?.id;
  }, [group?.id, projection.groups]);
  if (!group) return null;
  const index = projection.groups.findIndex((value) => value.id === group.id);
  return (
    <div className="selected-group">
      <h3 ref={title} tabIndex={-1}>
        <button
          type="button"
          className="selection-location"
          aria-label="선택 위치로 이동"
          onClick={() => panel.choose(group)}
        >
          선택 {index + 1} / {projection.groups.length} ·{" "}
          {projection.batch.proposals
            .find((proposal) => proposal.id === group.proposals[0]?.id)
            ?.operation.headingPath.at(-1) || "문서"}
        </button>
      </h3>

      <SelectionNavigation panel={panel} />
      <SelectionActions panel={panel} />
      <DetailEntry />
    </div>
  );
}

function SelectionNavigation({ panel }: { panel: Panel }) {
  return (
    <div className="selection-navigation">
      <button
        type="button"
        title="본문에서 Shift+F7: 이전 변경"
        onClick={() => panel.move(-1)}
      >
        이전 변경
      </button>
      <button
        type="button"
        title="본문에서 F7: 다음 변경"
        onClick={() => panel.move(1)}
      >
        다음 변경
      </button>
    </div>
  );
}

function SelectionActions({ panel }: { panel: Panel }) {
  return (
    <div className="proposal-actions">
      <button
        type="button"
        disabled={panel.blocked}
        onClick={() =>
          void panel.actions.execute("reject", panel.selected?.proposals ?? [])
        }
      >
        선택한 변경 거절
      </button>
      <button
        type="button"
        className="primary"
        disabled={panel.blocked}
        onClick={() =>
          void panel.actions.execute("accept", panel.selected?.proposals ?? [])
        }
      >
        선택한 변경 승인
      </button>
    </div>
  );
}
