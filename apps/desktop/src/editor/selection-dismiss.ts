import { type EditorView, ViewPlugin } from "@codemirror/view";

type Actions = { enabled: () => boolean; dismiss: () => void };
const clickDistance = 4;
const controlSelector = "button,a,input,textarea,select,summary,[role=button]";
export function selectionDismiss(actions: Actions) {
  return ViewPlugin.define(
    (view) => new SelectionDismissGesture(view, actions),
  );
}
export class SelectionDismissGesture {
  private start: { x: number; y: number } | null = null;
  private frame: number | null = null;
  constructor(
    private view: EditorView,
    private actions: Actions,
  ) {
    view.dom.addEventListener("pointerdown", this.pointerDown);
    view.dom.addEventListener("click", this.click);
    view.dom.addEventListener("compositionstart", this.cancel);
    view.scrollDOM.addEventListener("wheel", this.cancel);
    window.addEventListener("pointercancel", this.cancel);
    window.addEventListener("blur", this.cancel);
  }
  private pointerDown = (event: PointerEvent) => {
    this.cancel();
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      this.view.composing ||
      !this.actions.enabled()
    )
      return;
    if ((event.target as Element | null)?.closest?.(controlSelector)) return;
    this.start = { x: event.clientX, y: event.clientY };
  };
  private click = (event: MouseEvent) => {
    const start = this.start;
    this.cancel();
    if (
      !start ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >
        clickDistance
    )
      return;
    this.frame = requestAnimationFrame(() => {
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        if (
          this.actions.enabled() &&
          !this.view.composing &&
          this.view.state.selection.main.empty
        )
          this.actions.dismiss();
      });
    });
  };
  private cancel = () => {
    this.start = null;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  };
  destroy() {
    this.cancel();
    this.view.dom.removeEventListener("pointerdown", this.pointerDown);
    this.view.dom.removeEventListener("click", this.click);
    this.view.dom.removeEventListener("compositionstart", this.cancel);
    this.view.scrollDOM.removeEventListener("wheel", this.cancel);
    window.removeEventListener("pointercancel", this.cancel);
    window.removeEventListener("blur", this.cancel);
  }
}
