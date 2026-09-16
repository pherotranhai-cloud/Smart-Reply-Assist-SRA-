import React, { useCallback, useEffect, useRef } from 'react';
import { useDragControls, useReducedMotion } from 'motion/react';
import { getAdjacentTab, TabType } from './useTabNavigation';

// Travel that counts as a deliberate swipe rather than a stray finger.
const COMMIT_OFFSET = 60;
// px/s. A quick flick commits before it ever reaches COMMIT_OFFSET.
const COMMIT_VELOCITY = 500;

// Controls that own the horizontal axis themselves: text entry (where a drag
// is a caret/selection gesture) and anything explicitly opted out.
const NO_SWIPE_SELECTOR =
  'textarea, input, select, [contenteditable=""], [contenteditable="true"], [data-no-swipe]';

const SCROLLABLE = /^(auto|scroll)$/;

// `pinch-zoom` has to be spelled out alongside `pan-y`: restricting
// touch-action to panning alone would take zoom away from the whole app.
const PAN_Y = 'pan-y pinch-zoom';

// `overflow-x: visible` computes to `auto` as soon as overflow-y scrolls, so
// the declared value cannot tell a sideways carousel from an ordinary
// vertical scroller - only real overflow can. Ignore a few pixels of it so a
// rounding artefact in a full-width container cannot disable the gesture.
const HORIZONTAL_SLACK = 16;

// Motion does not export PanInfo from its public entry point, so describe the
// only two fields this hook reads.
interface SwipeInfo {
  offset: { x: number; y: number };
  velocity: { x: number; y: number };
}

// A carousel, chip row or code block that can actually be panned sideways.
function isHorizontalScroller(node: Element, overflowX: string): boolean {
  return SCROLLABLE.test(overflowX) && node.scrollWidth > node.clientWidth + HORIZONTAL_SLACK;
}

function ownsHorizontalGesture(target: Element | null, surface: Element): boolean {
  // Anything rendered outside the swipe surface (the floating assistant is a
  // fixed sibling of the layout) keeps its own gestures.
  if (!target || !surface.contains(target)) return true;

  let node: Element | null = target;
  while (node && node !== surface) {
    if (node.matches(NO_SWIPE_SELECTOR)) return true;
    const { overflowX, position } = window.getComputedStyle(node);
    // A modal or floating bar is not the page underneath it, so a drag there
    // must not navigate the tab behind it.
    if (position === 'fixed' || isHorizontalScroller(node, overflowX)) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * Blink resets an inherited `touch-action` on every scroll container, so the
 * restriction on the surface stops applying below the first scrollable
 * descendant and the browser claims horizontal gestures - the drag then dies
 * on a pointercancel after one move. Repeat the restriction on vertical-only
 * scrollers; scrollers that really do pan sideways are left to their own
 * gesture.
 */
function restrictVerticalScrollers(surface: HTMLElement, settled: WeakSet<Element>) {
  const nodes: Element[] = [surface, ...Array.from(surface.querySelectorAll('*'))];
  for (const node of nodes) {
    if (settled.has(node) || !(node instanceof HTMLElement)) continue;
    const { overflowX, overflowY } = window.getComputedStyle(node);
    if (!SCROLLABLE.test(overflowY)) {
      // An ordinary box inherits the restriction and will not start scrolling.
      settled.add(node);
      continue;
    }
    // Whether a scroller pans sideways depends on content that may still be
    // loading, so scrollers stay under review on every later pass.
    if (isHorizontalScroller(node, overflowX)) {
      node.style.removeProperty('touch-action');
    } else {
      node.style.touchAction = PAN_Y;
    }
  }
}

/**
 * Horizontal swipe between tabs, iOS-style: the page follows the finger,
 * rubber-bands at the first and last tab, and commits on release.
 */
export function useSwipeTabs(activeTab: TabType, setActiveTab: (tab: TabType) => void) {
  const dragControls = useDragControls();
  const prefersReducedMotion = useReducedMotion();
  const surfaceRef = useRef<HTMLDivElement>(null);
  // Which axis `dragDirectionLock` settled on; null while a gesture is still
  // ambiguous (or was only a tap).
  const lockedAxis = useRef<'x' | 'y' | null>(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    // Elements already known to be unscrollable are never measured again, so
    // repeat passes only cost a walk plus the handful of real scrollers.
    const settled = new WeakSet<Element>();
    restrictVerticalScrollers(surface, settled);

    // Lazy tabs only mount once their chunk resolves, so keep watching for
    // scrollers that appear after this tab first rendered.
    let queued = 0;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        restrictVerticalScrollers(surface, settled);
      });
    });
    observer.observe(surface, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (queued) cancelAnimationFrame(queued);
    };
  }, [activeTab]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    // Mouse drags are text selection, not navigation.
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    if (ownsHorizontalGesture(event.target as Element | null, event.currentTarget)) return;
    lockedAxis.current = null;
    dragControls.start(event);
  }, [dragControls]);

  const onDirectionLock = useCallback((axis: 'x' | 'y') => {
    lockedAxis.current = axis;
  }, []);

  const onDragEnd = useCallback((_event: unknown, info: SwipeInfo) => {
    const axis = lockedAxis.current;
    lockedAxis.current = null;
    // A vertical drag was the page scrolling; a null axis never left the
    // 10px direction-lock threshold, i.e. it was a tap.
    if (axis !== 'x') return;

    const { offset, velocity } = info;
    const flicked = Math.abs(velocity.x) > COMMIT_VELOCITY;
    if (!flicked && Math.abs(offset.x) <= COMMIT_OFFSET) return;

    // A flick that doubles back should follow the flick, not the travel.
    // Content follows the finger, so dragging left reveals the next tab.
    const direction = flicked ? velocity.x : offset.x;
    const target = getAdjacentTab(activeTab, direction < 0 ? 1 : -1);
    if (!target) return;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }
    setActiveTab(target);
  }, [activeTab, setActiveTab]);

  return {
    surfaceRef,
    dragControls,
    onPointerDown,
    onDirectionLock,
    onDragEnd,
    // Reduced motion keeps the navigation but drops the rubber-band travel.
    dragElastic: prefersReducedMotion ? 0 : 0.2,
  };
}
