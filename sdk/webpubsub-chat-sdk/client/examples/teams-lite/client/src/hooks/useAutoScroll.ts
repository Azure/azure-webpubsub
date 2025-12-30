import { useEffect } from "react";
import type { RefObject } from "react";

/**
 * Auto-scroll a container to bottom whenever dependencies change.
 * Skips if user has scrolled up significantly (simple heuristic).
 */
export function useAutoScroll<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  deps: unknown[] = []
): void {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // If user manually scrolled up more than 150px, don't force-jump.
    if (distanceFromBottom > 150) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
