import { NavigationSlot } from "../editor/NavigationSlots";
import { useReviewSurface } from "../editor/WorkspacePanels";
import type { Heading } from "../generated/Heading";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { DiffViewer } from "./DiffViewer";
import { GroupBar, GroupNavigation } from "./GroupBar";
import { CommentSelection, ReviewPrimary } from "./ReviewTools";
import { SelectionRequestEntry } from "./SelectionRequestEntry";
import type { Panel } from "./useReviewPanel";
export function ReviewComparison({
  panel,
  projection,
  active,
  headings,
}: {
  panel: Panel;
  projection: ReviewProjection;
  active: boolean;
  headings: Heading[];
}) {
  const surface = useReviewSurface();
  return (
    <>
      {active && (
        <NavigationSlot name="outline">
          <GroupNavigation panel={panel} projection={projection} />
        </NavigationSlot>
      )}
      <DiffViewer
        active={active}
        textDetails={false}
        selectedGroup={panel.selected?.id}
        headings={headings}
        projection={projection}
        onSelection={panel.setSelection}
        onDismissSelection={
          panel.selectedRequest.active && !panel.blocked
            ? () => {
                void panel.selectedRequest.dismiss();
              }
            : undefined
        }
        onSelectionIssue={panel.setSelectionIssue}
        onEditSelection={() => {
          panel.startSelectedRequest();
          surface?.showDetail();
        }}
        selectionTools={
          !panel.selectedRequest.active && (
            <SelectionRequestEntry panel={panel} />
          )
        }
        onGroupSelect={panel.selectGroup}
        onMove={panel.move}
        jump={panel.jump}
        tools={comparisonTools(panel, projection)}
      />
    </>
  );
}

function comparisonTools(panel: Panel, projection: ReviewProjection) {
  return {
    header: <ReviewPrimary panel={panel} projection={projection} />,
    selection: (
      <>
        <GroupBar panel={panel} projection={projection} />
        {projection.groups.length > 0 && panel.selectionIssue && (
          <p className="selection-notice" role="status">
            {panel.selectionIssue}
          </p>
        )}
        {projection.groups.length > 0 && panel.selectedRequest.message && (
          <p className="selection-notice" role="status">
            {panel.selectedRequest.message}
          </p>
        )}
      </>
    ),
    compact:
      panel.detail.kind === "comment" ? (
        <CommentSelection panel={panel} projection={projection} />
      ) : null,
  };
}
