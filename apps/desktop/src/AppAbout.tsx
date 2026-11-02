import { useEffect, useRef, useState } from "react";
import "./about.css";

const identity = {
  id: import.meta.env.VITE_DOCREVIEW_BUILD_ID || "개발 서버 · 식별자 없음",
  profile: import.meta.env.VITE_DOCREVIEW_BUILD_PROFILE || "dev-server",
  version: import.meta.env.VITE_DOCREVIEW_VERSION || "0.1.0",
  builtAt: import.meta.env.VITE_DOCREVIEW_BUILD_AT,
};
export function AppAbout() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="app-about-entry"
        aria-label="DocReview 앱 정보"
        onClick={() => setOpen(true)}
      >
        DocReview
      </button>
      {open && <AboutDialog close={() => setOpen(false)} />}
    </>
  );
}
function AboutDialog({ close }: { close: () => void }) {
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
      className="app-about"
      aria-labelledby="app-about-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <h2 id="app-about-title">DocReview 앱 정보</h2>
      <dl>
        <dt>버전</dt>
        <dd>{identity.version}</dd>
        <dt>빌드 ID</dt>
        <dd data-testid="build-id">{identity.id}</dd>
        <dt>빌드 종류</dt>
        <dd>
          {identity.profile === "e2e"
            ? "E2E 검증용"
            : identity.profile === "release"
              ? "일반 release"
              : identity.profile === "debug"
                ? "일반 debug"
                : "개발 서버"}
        </dd>
        <dt>빌드 시각</dt>
        <dd>
          {identity.builtAt
            ? new Date(identity.builtAt).toLocaleString("ko-KR", {
                timeZoneName: "short",
              })
            : "기록 없음"}
        </dd>
      </dl>
      <button type="button" onClick={close}>
        앱 정보 닫기
      </button>
    </dialog>
  );
}
