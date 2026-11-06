import { useEffect, useId, useRef } from "react";
import { popoverPlacement } from "../editor/SelectionPopover";
import { ReviewHeader } from "./ReviewContent";
import type { UnitToolsProps } from "./UnitReviewTools";
import {
  decisionLabel,
  unitCounts,
  unitDecision,
  unitLabel,
} from "./unit-review-model";
import type { UnitNavigation } from "./useUnitNavigation";

type Props = UnitToolsProps & { feedback: string };
export function UnitReviewMenu(props: Props) {
  const id = useId();
  const menu = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const close = () => {
      if (!menu.current?.matches(":popover-open")) return;
      menu.current.hidePopover();
      trigger.current?.focus();
    };
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);
  return (
    <div className="unit-options">
      <button ref={trigger} type="button" popoverTarget={id}>
        검토 도구
      </button>
      <section
        ref={menu}
        id={id}
        popover="auto"
        className="unit-options-popup"
        aria-label="검토 도구"
        onToggle={(event) => {
          if (event.newState === "open") {
            positionMenu(menu.current, trigger.current);
            menu.current
              ?.querySelector("button")
              ?.focus({ preventScroll: true });
          }
        }}
      >
        <button type="button" popoverTarget={id} popoverTargetAction="hide">
          도구 닫기
        </button>
        <UnitMenuContents
          {...props}
          close={() => menu.current?.hidePopover()}
        />
      </section>
    </div>
  );
}
function UnitMenuContents(props: Props & { close: () => void }) {
  const counts = unitCounts(props.projection.batch);
  return (
    <>
      <button
        className="unit-bulk-menu"
        type="button"
        disabled={
          props.blocked || !counts.pending || props.navigation.value.original
        }
        onClick={() => {
          props.close();
          props.panel.confirm();
        }}
      >
        남은 {counts.pending}개 승인…
      </button>
      <UnitInformation {...props} />
      <UnitViewOptions navigation={props.navigation} close={props.close} />
      <p>
        비교 본문에서 F7은 다음 변경, Shift+F7은 이전 변경으로 이동합니다. 현재
        표시 필터를 따릅니다.
      </p>
      <p>
        승인하면 원문에 바로 저장됩니다. 미승인 변경은 원문에 포함되지 않습니다.
      </p>
      {props.feedback && <p>{props.feedback}</p>}
      <ReviewHeader review={props.panel.review} />
      {props.options}
    </>
  );
}
function positionMenu(
  menu: HTMLElement | null,
  trigger: HTMLButtonElement | null,
) {
  if (!menu || !trigger) return;
  const rect = trigger.getBoundingClientRect();
  const margin = 16;
  menu.style.maxHeight = `${window.innerHeight - margin}px`;
  const position = popoverPlacement(
    { left: rect.right - menu.offsetWidth, top: rect.bottom, above: rect.top },
    { width: menu.offsetWidth, height: menu.offsetHeight },
    { width: innerWidth, height: innerHeight },
  );
  menu.style.left = `${position.left}px`;
  menu.style.top = `${position.top}px`;
}
function UnitInformation({ navigation, projection }: UnitToolsProps) {
  const unit = navigation.selected;
  if (!unit)
    return <p>이 목록에 표시할 변경이 없습니다. 필터를 바꿔 주세요.</p>;
  return (
    <section className="unit-information" aria-label="선택한 변경 정보">
      <h4>
        변경 {unit.number} · {unit.title}
      </h4>
      <p>
        {unitLabel(unit.kind)} ·{" "}
        {decisionLabel(unitDecision(projection.batch, unit))}
      </p>
      <p>
        {unit.reason}
        {unit.proposals.length > 1
          ? ` · 관련 위치 ${unit.proposals.length}곳을 함께 적용합니다.`
          : ""}
      </p>
    </section>
  );
}
function UnitViewOptions({
  navigation,
  close,
}: {
  navigation: UnitNavigation;
  close: () => void;
}) {
  return (
    <div className="unit-view-options">
      <ViewCheckbox navigation={navigation} field="split" label="나란히 비교" />
      <ViewCheckbox navigation={navigation} field="full" label="전체 문맥" />
      <ViewCheckbox
        navigation={navigation}
        field="whitespace"
        label="공백 표시"
      />
      <button
        type="button"
        onClick={() => {
          navigation.update({ original: true });
          close();
        }}
      >
        원래 전체 후보 보기
      </button>
    </div>
  );
}
function ViewCheckbox({
  navigation,
  field,
  label,
}: {
  navigation: UnitNavigation;
  field: "split" | "full" | "whitespace";
  label: string;
}) {
  return (
    <label>
      <input
        type="checkbox"
        checked={navigation.value[field]}
        onChange={(event) =>
          navigation.update({ [field]: event.target.checked })
        }
      />
      {label}
    </label>
  );
}
