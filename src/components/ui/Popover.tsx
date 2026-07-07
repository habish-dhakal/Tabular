"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface Coords {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/**
 * Click-to-open popover. The panel is rendered in a portal to <body> with
 * fixed positioning, so it is never clipped by ancestor `overflow: hidden`
 * containers (e.g. the scrollable grid). It flips upward when there isn't
 * room below and caps its height to the available viewport space (scrolls).
 */
export function Popover({
  trigger,
  children,
  align = "left",
  width = 300,
  className,
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;

    const w = Math.min(width, window.innerWidth - 2 * margin);
    let left = align === "right" ? r.right - w : r.left;
    left = Math.min(Math.max(margin, left), window.innerWidth - w - margin);

    if (openUp) {
      setCoords({ left, bottom: window.innerHeight - r.top + gap, maxHeight: spaceAbove - gap });
    } else {
      setCoords({ left, top: r.bottom + gap, maxHeight: spaceBelow - gap });
    }
  }, [align, width]);

  // Position before paint to avoid a flash at the wrong spot.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const reposition = () => place();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // Reposition while open if the layout shifts. Capture scrolls from any
    // ancestor scroll container, not just window.
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, place]);

  const w = Math.min(width, typeof window !== "undefined" ? window.innerWidth - 16 : width);

  return (
    <>
      <div ref={triggerRef} className="inline-flex" onClick={() => setOpen((o) => !o)}>
        {trigger(open)}
      </div>
      {open && mounted && coords &&
        createPortal(
          <div
            ref={panelRef}
            className={cn(
              "anim-pop thin-scroll fixed z-50 overflow-y-auto rounded-xl border border-border-token bg-background p-2 shadow-lg",
              className
            )}
            style={{
              left: coords.left,
              top: coords.top,
              bottom: coords.bottom,
              width: w,
              maxHeight: Math.max(160, coords.maxHeight),
            }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body
        )}
    </>
  );
}
