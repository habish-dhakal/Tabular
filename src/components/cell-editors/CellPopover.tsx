"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Floating editor surface anchored to a grid/modal cell. Rendered in a body
 * portal (never clipped by the grid's overflow), flips up when cramped, and
 * commits on outside-click / Escape.
 */
export function CellPopover({
  anchorRect,
  onClose,
  minWidth = 240,
  children,
}: {
  anchorRect: DOMRect;
  onClose: () => void;
  minWidth?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!mounted) return;
    const el = ref.current;
    const h = el?.offsetHeight ?? 300;
    const margin = 8;
    const width = Math.max(minWidth, anchorRect.width);
    let left = anchorRect.left;
    left = Math.min(Math.max(margin, left), window.innerWidth - width - margin);
    const spaceBelow = window.innerHeight - anchorRect.bottom - margin;
    if (spaceBelow >= h || spaceBelow >= anchorRect.top - margin) {
      setPos({ left, top: Math.min(anchorRect.bottom + 2, window.innerHeight - h - margin) });
    } else {
      setPos({ left, bottom: window.innerHeight - anchorRect.top + 2 });
    }
  }, [mounted, anchorRect, minWidth]);

  useEffect(() => {
    if (!mounted) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Defer so the opening click doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={ref}
      className={
        "fixed z-50 rounded-xl border border-border-token bg-background shadow-xl" +
        (pos ? " anim-pop" : "")
      }
      style={{
        left: pos?.left ?? anchorRect.left,
        top: pos?.top,
        bottom: pos?.bottom,
        width: Math.max(minWidth, anchorRect.width),
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body
  );
}
