import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

type Actions = {
  show: (view: EditorView, focus: boolean) => void;
  close: () => void;
  enabled?: () => boolean;
};
export function selectionGesture(actions: Actions) {
  return ViewPlugin.define((view) => new SelectionGesture(view, actions));
}
export class SelectionGesture {
  private dragging = false;
  private frame: number | null = null;
  constructor(
    private view: EditorView,
    private actions: Actions,
  ) {
    view.dom.addEventListener("pointerdown", this.start);
    window.addEventListener("pointerup", this.finish);
    view.scrollDOM.addEventListener("scroll", this.scrolled);
    view.dom.addEventListener("compositionstart", this.close);
  }
  private start = () => {
    this.dragging = true;
    this.close();
  };
  private finish = () => {
    if (!this.dragging) return;
    this.dragging = false;
    this.schedule();
  };
  private close = () => {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.actions.close();
  };
  private scrolled = () => {
    const pending = this.frame !== null;
    this.close();
    if (pending && !this.dragging) this.schedule();
  };
  private schedule() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.frame = requestAnimationFrame(() => {
        this.frame = null;
        if (
          this.actions.enabled?.() !== false &&
          !this.view.state.selection.main.empty &&
          !this.view.composing
        )
          this.actions.show(this.view, false);
      });
    });
  }
  update(update: ViewUpdate) {
    if (this.actions.enabled?.() === false) {
      this.dragging = false;
      this.close();
      return;
    }
    if (
      update.docChanged ||
      update.view.composing ||
      update.state.selection.main.empty
    ) {
      this.close();
      return;
    }
    if (
      update.selectionSet &&
      !this.dragging &&
      update.transactions.some((transaction) =>
        transaction.isUserEvent("select"),
      )
    )
      this.schedule();
  }
  destroy() {
    this.close();
    this.view.dom.removeEventListener("pointerdown", this.start);
    window.removeEventListener("pointerup", this.finish);
    this.view.scrollDOM.removeEventListener("scroll", this.scrolled);
    this.view.dom.removeEventListener("compositionstart", this.close);
  }
}
