import { useLayoutEffect } from "react";
import type { RefObject } from "react";

export function useTextareaAutosize(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  options?: { maxHeight?: number } // optional tweak
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    // reset then grow
    el.style.height = "auto";
    const max = options?.maxHeight ?? 180; // default cap
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  }, [ref, value, options?.maxHeight]);
}
