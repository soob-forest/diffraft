import type { DocumentSummary } from "../generated/DocumentSummary";
import { useDocumentMenus } from "./DocumentMenus";
import { focusDocumentTarget } from "./menu-behavior";

type Props = { document: DocumentSummary; completed?: boolean };
export function DocumentItem({ document, completed = false }: Props) {
  const { workspace, target } = useDocumentMenus();
  const openMenu = useOpenMenu({ document, completed });
  return (
    <li className="document-list-row" {...rowMenuEvents(openMenu)}>
      <DocumentOpenButton document={document} completed={completed} />
      <button
        type="button"
        className="document-more"
        disabled={workspace.busy}
        aria-label={`${document.title} 문서 작업`}
        aria-haspopup="menu"
        aria-expanded={target?.document.id === document.id}
        title="문서 작업 · 우클릭으로도 열기"
        onClick={(event) => openMenu(event.currentTarget)}
      >
        <MoreIcon />
      </button>
    </li>
  );
}
function rowMenuEvents(openMenu: ReturnType<typeof useOpenMenu>) {
  return {
    onContextMenu: (event: React.MouseEvent<HTMLLIElement>) => {
      event.preventDefault();
      const trigger =
        event.currentTarget.querySelector<HTMLButtonElement>(".document-more");
      if (trigger) openMenu(trigger, { x: event.clientX, y: event.clientY });
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLLIElement>) => {
      if (
        event.key !== "ContextMenu" &&
        !(event.shiftKey && event.key === "F10")
      )
        return;
      event.preventDefault();
      const trigger =
        event.currentTarget.querySelector<HTMLButtonElement>(".document-more");
      if (trigger) openMenu(trigger);
    },
  };
}

function useOpenMenu({ document, completed = false }: Props) {
  const { workspace, show } = useDocumentMenus();
  return (trigger: HTMLElement, point?: { x: number; y: number }) => {
    if (workspace.busy) return;
    const bounds = trigger.getBoundingClientRect();
    show({
      document,
      completed,
      trigger,
      ...(point ?? { x: bounds.left, y: bounds.bottom }),
    });
  };
}
function DocumentOpenButton({ document, completed }: Props) {
  const { workspace } = useDocumentMenus();
  return (
    <button
      type="button"
      disabled={workspace.busy}
      aria-label={completed ? `${document.title} 다시 열기` : undefined}
      aria-current={
        !completed && document.id === workspace.editor?.document.id
          ? "page"
          : undefined
      }
      onClick={(event) => {
        const trigger = event.currentTarget;
        void workspace
          .navigate(document.id)
          .then(() => focusDocumentTarget(trigger));
      }}
    >
      {document.title}
    </button>
  );
}
function MoreIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}
