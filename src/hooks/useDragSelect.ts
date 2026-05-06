/**
 * useDragSelect — rubber-band selection for the NFT grid.
 *
 * How it works:
 *   1. User presses mouse/touch on the grid background (not on a card)
 *   2. A translucent selection rectangle is drawn in real time
 *   3. Any card whose bounding box overlaps the rectangle is added to the
 *      pending selection set (shown with a lighter highlight)
 *   4. On mouse-up the pending set is committed via onSelect()
 *
 * The hook returns:
 *   - containerRef  — attach to the scrollable grid wrapper
 *   - cardRef       — call cardRef(id, element) inside each card to register it
 *   - selectionRect — {x,y,w,h} in px relative to the container, or null
 *   - dragging      — boolean, true while the rectangle is active
 *   - pendingIds    — Set<string> of IDs currently inside the rectangle
 *
 * Design decisions:
 *   - We use pointer events (works mouse + touch) and capture them on the window
 *     so scrolling the page does not break the drag.
 *   - Cards that already have a popover open are skipped via stopPropagation —
 *     the drag only triggers when the pointerdown target is the grid or a card's
 *     image area (i.e. no interactive child consumed the event).
 *   - Minimum drag distance of 6px before the rectangle appears so normal clicks
 *     on cards are unaffected.
 */

import { useCallback, useRef, useState } from "react";

export interface DragRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface UseDragSelectOptions {
  /** Called on mouse-up with the final set of IDs inside the rectangle */
  onSelect: (ids: Set<string>) => void;
  /** If true, IDs already in this set are toggled off instead of on */
  selectedIds?: Set<string>;
}

export const useDragSelect = ({ onSelect, selectedIds }: UseDragSelectOptions) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Map from NFT id → DOM element (registered by each card)
  const cardEls = useRef<Map<string, HTMLElement>>(new Map());

  // Drag state stored in a ref so event handlers don't close over stale values
  const drag = useRef<{
    active: boolean;
    startX: number; // client coords
    startY: number;
    curX: number;
    curY: number;
    scrollTopAtStart: number;
  }>({ active: false, startX: 0, startY: 0, curX: 0, curY: 0, scrollTopAtStart: 0 });

  const [selectionRect, setSelectionRect] = useState<DragRect | null>(null);
  const [pendingIds,    setPendingIds]    = useState<Set<string>>(new Set());
  const [dragging,      setDragging]      = useState(false);

  // ── Register / unregister card elements ───────────────────────────────────

  const cardRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cardEls.current.set(id, el);
    else    cardEls.current.delete(id);
  }, []);

  // ── Hit-test: which cards overlap the drag rectangle? ────────────────────

  const computePending = useCallback((): Set<string> => {
    const container = containerRef.current;
    if (!container) return new Set();

    const cRect = container.getBoundingClientRect();
    const d = drag.current;

    // Scroll delta since drag started (container may have scrolled)
    const scrollDelta = container.scrollTop - d.scrollTopAtStart;

    // Rectangle in client coords
    const minCX = Math.min(d.startX, d.curX);
    const maxCX = Math.max(d.startX, d.curX);
    const minCY = Math.min(d.startY, d.curY);
    const maxCY = Math.max(d.startY, d.curY);

    const pending = new Set<string>();

    cardEls.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      // Adjust for scroll
      const adjustedTop    = r.top    - scrollDelta;
      const adjustedBottom = r.bottom - scrollDelta;

      const overlaps =
        r.right  > minCX &&
        r.left   < maxCX &&
        adjustedBottom > minCY &&
        adjustedTop    < maxCY;

      if (overlaps) {
        // If already selected, don't add to pending (we only add, not deselect, mid-drag)
        if (!selectedIds?.has(id)) pending.add(id);
      }
    });

    // Rectangle in container-local coords (for CSS positioning)
    const localMinX = minCX - cRect.left;
    const localMinY = minCY - cRect.top + container.scrollTop;

    setSelectionRect({
      x: localMinX,
      y: localMinY,
      w: maxCX - minCX,
      h: maxCY - minCY,
    });

    return pending;
  }, [selectedIds]);

  // ── Pointer events ────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only primary button; ignore if a child (popover, button, etc.) was the target
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    // If the user clicked directly on a card's interactive child, skip
    // We allow drag starting on: the grid container, the card image area (role=checkbox)
    const isCardOrGrid =
      target === containerRef.current ||
      target.closest("[data-drag-handle]") !== null;

    if (!isCardOrGrid) return;

    drag.current = {
      active: false, // becomes true after MIN_DIST threshold
      startX: e.clientX,
      startY: e.clientY,
      curX:   e.clientX,
      curY:   e.clientY,
      scrollTopAtStart: containerRef.current?.scrollTop ?? 0,
    };

    const MIN_DIST = 6;

    const onMove = (me: PointerEvent) => {
      drag.current.curX = me.clientX;
      drag.current.curY = me.clientY;

      const dx = me.clientX - drag.current.startX;
      const dy = me.clientY - drag.current.startY;

      if (!drag.current.active) {
        if (Math.sqrt(dx * dx + dy * dy) < MIN_DIST) return;
        drag.current.active = true;
        setDragging(true);
      }

      const pending = computePending();
      setPendingIds(pending);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup",   onUp);

      if (drag.current.active) {
        const finalPending = computePending();
        onSelect(finalPending);
      }

      drag.current.active = false;
      setDragging(false);
      setSelectionRect(null);
      setPendingIds(new Set());
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup",   onUp);
  }, [computePending, onSelect]);

  return {
    containerRef,
    cardRef,
    selectionRect,
    dragging,
    pendingIds,
    handlePointerDown,
  };
};
