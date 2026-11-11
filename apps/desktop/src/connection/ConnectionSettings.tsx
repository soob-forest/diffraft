import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ProviderSettings } from "./ProviderSettings";
import "./connection.css";

export function ConnectionSettings({
  label = "AI 연결 설정",
  onClose,
  icon = false,
}: {
  label?: string;
  onClose?: () => void;
  icon?: boolean;
} = {}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    onClose?.();
    requestAnimationFrame(() => {
      const target = trigger.current?.getClientRects().length
        ? trigger.current
        : document.querySelector<HTMLButtonElement>(
            'button[aria-controls="document-list"]',
          );
      target?.focus();
    });
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={icon ? "settings-trigger" : undefined}
        aria-label={label}
        title={label}
        onClick={(event) => {
          event.currentTarget.focus();
          setOpen(true);
        }}
      >
        {icon && <SettingsIcon />}
        <span>{label}</span>
      </button>
      {open && createPortal(<ConnectionDialog close={close} />, document.body)}
    </>
  );
}

function ConnectionDialog({ close }: { close: () => void }) {
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="connection-dialog"
      aria-labelledby="connection-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <ProviderSettings close={close} onBusy={setBusy} />
    </dialog>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 3-.6 3a7 7 0 0 0-1.8 1L3.7 6 1.8 9.3 4 11.4a7 7 0 0 0 0 2L1.8 15.5l1.9 3.3 2.9-1a7 7 0 0 0 1.8 1l.6 3h4l.6-3a7 7 0 0 0 1.8-1l2.9 1 1.9-3.3-2.2-2.1a7 7 0 0 0 0-2l2.2-2.1L18.3 6l-2.9 1a7 7 0 0 0-1.8-1L13 3Z" />
      <circle cx="11" cy="12.4" r="3" />
    </svg>
  );
}
