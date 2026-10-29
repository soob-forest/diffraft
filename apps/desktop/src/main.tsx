import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
import "./editor/editor.css";
import "./usability.css";
import "./editor/workspace-layout.css";
import "./editor/task-layout.css";
import "./review/review-layout.css";
import "./review/diff-typography.css";
import "./review/detail-layout.css";
import "./review/comment-layout.css";
import "./editor/responsive-layout.css";
import "./editor/compact-layout.css";
import "./comparison-surfaces.css";

if (import.meta.env.VITE_DOCREVIEW_E2E === "true") {
  await import("@wdio/tauri-plugin");
}
const root = document.getElementById("root");
if (!root) throw new Error("앱 화면을 초기화할 수 없습니다.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
