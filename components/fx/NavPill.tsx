"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "./useFx";

/**
 * Sidebar navigation whose active highlight is a single pill that glides to
 * the newly active link instead of two backgrounds swapping.
 *
 * The pill is a plain DOM element on purpose: liquid-gooey's silhouette needs
 * an opaque fill to survive its alpha-contrast pass, which the studio's
 * translucent liquid-glass knob (`--lg-knob`) does not have.
 */
export function NavPill({ children, activeKey, className }: { children: ReactNode; activeKey: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [rect, setRect] = useState<{ top: number; height: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const measure = () => {
      const link = root.querySelector<HTMLElement>(".ss-sidebar-link.is-active");
      setRect(link ? { top: link.offsetTop, height: link.offsetHeight, width: link.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [activeKey]);

  if (reduced) {
    return (
      <div ref={box} className={className}>
        {children}
      </div>
    );
  }
  return (
    <div ref={box} className={`${className || ""} has-pill`}>
      {rect ? <i className="ss-sidebar__pill" style={{ transform: `translateY(${rect.top}px)`, height: rect.height, width: rect.width }} aria-hidden /> : null}
      {children}
    </div>
  );
}
