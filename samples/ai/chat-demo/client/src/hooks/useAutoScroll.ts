import { useEffect } from "react";
import type { RefObject } from "react";


export function useAutoScroll<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  deps: unknown[] = []
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
