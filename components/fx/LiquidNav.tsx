"use client";

import { Liquid } from "liquid-gooey";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "./useFx";

/**
 * Sidebar navigation with a liquid pill that trails between links: the pill
 * is a liquid-gooey "move" body positioned on the active link, so a route
 * change reads as the surface flowing to its new place instead of two
 * backgrounds swapping.
 */
export function LiquidNav({ children, activeKey, className }: { children: ReactNode; activeKey: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [rect, setRect] = useState<{ top: number; height: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const root = box.current;
    if (!root) return;
    const measure = () => {
      const link = root.querySelector<HTMLElement>(".ss-sidebar-link.is-active");
      if (!link) return setRect(null);
      setRect({ top: link.offsetTop, height: link.offsetHeight, width: link.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [activeKey]);

  const pillStyle = rect ? { transform: `translateY(${rect.top}px)`, height: rect.height, width: rect.width } : undefined;

  if (reduced) {
    return (
      <div ref={box} className={className}>
        {children}
      </div>
    );
  }
  return (
    <Liquid ref={box} className={`${className || ""} has-pill`} fill="var(--lg-knob)" blur={3} contrast={14} shadow="inset 0 1px 0 rgb(var(--lg-hi) / calc(var(--lg-hi-a) * 0.6)), 0 1px 2px rgb(var(--lg-shade) / calc(var(--lg-shade-a) * 0.5))">
      {rect ? (
        <Liquid.Item effect="move" move={{ springiness: 0.55, wobble: 0.45, stretch: 0.3, trail: 0.4 }} radius={12}>
          <i className="ss-sidebar__pill" style={pillStyle} aria-hidden />
        </Liquid.Item>
      ) : null}
      {children}
    </Liquid>
  );
}
