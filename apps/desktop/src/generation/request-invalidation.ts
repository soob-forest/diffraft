import { useEffect, useRef } from "react";

const REQUEST_INPUT_CHANGED = "docreview:request-input-changed";
export function requestInputChanged() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(REQUEST_INPUT_CHANGED));
}
export function useRequestInvalidation(close: () => void) {
  const current = useRef(close);
  current.current = close;
  useEffect(() => {
    const invalidate = () => current.current();
    window.addEventListener(REQUEST_INPUT_CHANGED, invalidate);
    return () => window.removeEventListener(REQUEST_INPUT_CHANGED, invalidate);
  }, []);
}
