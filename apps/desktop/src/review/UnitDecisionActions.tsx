import { repeatedDecisionKey } from "./unit-review-model";

type Props = {
  blocked: boolean;
  number: number;
  onDecide: (kind: "accept" | "reject") => void;
};
export function UnitDecisionActions(props: Props) {
  return (
    <>
      <DecisionButton {...props} kind="reject" />
      <DecisionButton {...props} kind="accept" />
    </>
  );
}
function DecisionButton({
  blocked,
  number,
  onDecide,
  kind,
}: Props & { kind: "accept" | "reject" }) {
  return (
    <button
      type="button"
      className={`${kind === "accept" ? "primary " : ""}unit-decision`}
      disabled={blocked}
      onMouseDown={(event) => {
        if (event.detail > 1) event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (
          event.nativeEvent.isComposing ||
          repeatedDecisionKey(event.key, event.repeat)
        )
          event.preventDefault();
      }}
      onClick={(event) => {
        if (event.detail < 2) onDecide(kind);
      }}
    >
      변경 {number} {kind === "accept" ? "승인" : "거절"}
    </button>
  );
}
