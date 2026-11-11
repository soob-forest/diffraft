import { useState } from "react";
import { usePanelWidth } from "./PanelResize";

const SINGLE_PANEL_WIDTH = 720;
export function useWorkspacePanels() {
  const [open, setOpen] = useState(
    () => window.innerWidth > SINGLE_PANEL_WIDTH,
  );
  const [width, setWidth] = usePanelWidth("request");
  return { open, setOpen, width, setWidth };
}
export type WorkspacePanelControl = ReturnType<typeof useWorkspacePanels>;
