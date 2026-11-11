export type PanelKind = "documents" | "request";
const LIMITS = {
  documents: { minimum: 160, maximum: 360, fraction: 0.26 },
  request: { minimum: 280, maximum: 600, fraction: 0.55 },
};
export const PANEL_DEFAULTS = { documents: 196, request: 360 };
export const RESIZE_STEP = 16;

export function panelLimits(kind: PanelKind, containerWidth: number) {
  const limits = LIMITS[kind];
  const fraction =
    kind === "documents" && containerWidth <= 1000 ? 0.8 : limits.fraction;
  return {
    minimum: limits.minimum,
    maximum: Math.max(
      limits.minimum,
      Math.min(limits.maximum, containerWidth * fraction),
    ),
  };
}
export function clampSize(value: number, minimum: number, maximum: number) {
  return Math.round(Math.min(maximum, Math.max(minimum, value)));
}
export function keyboardSize(
  key: string,
  value: number,
  limits: ReturnType<typeof panelLimits>,
) {
  if (key === "Home") return limits.minimum;
  if (key === "End") return limits.maximum;
  if (key === "ArrowLeft") return value - RESIZE_STEP;
  if (key === "ArrowRight") return value + RESIZE_STEP;
  return null;
}
