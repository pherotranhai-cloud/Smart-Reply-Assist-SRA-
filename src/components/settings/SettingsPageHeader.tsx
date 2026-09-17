import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useTabActive } from '../../hooks/useTabNavigation';

interface SettingsPageHeaderProps {
  t: (key: string) => string;
  /**
   * 'page' sits on the app background (mobile, inside Layout's px-4);
   * 'pane' sits inside the desktop settings card, which scrolls itself.
   */
  variant?: 'page' | 'pane';
}

/** Height of the pinned bar's title row, in px. */
const BAR_HEIGHT = 44;

/**
 * iOS-style large title for the settings page: a 34px title that scrolls away
 * under a pinned bar, which fades in a compact title once the big one is gone.
 *
 * The wrapper is `display: contents` on purpose. A sticky element can never
 * leave its containing block, so the pinned bar has to sit directly in the
 * scrolling page — an ordinary wrapper would unstick it after ~50px.
 */
export const SettingsPageHeader: React.FC<SettingsPageHeaderProps> = ({ t, variant = 'page' }) => {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  // The Settings tab stays mounted behind whatever tab is showing, and the bar
  // below is portalled into <body>, where the tab's `display: none` cannot
  // reach it. Without this it stayed pinned across the top of every other tab.
  const isTabActive = useTabActive();

  // The two layouts scroll different things (the document on mobile, the pane
  // on desktop), so watch against the viewport: with root: null the observer
  // still accounts for whichever ancestor clips the sentinel. The top margin is
  // measured off the bar rather than assumed, because the bar rests at the
  // viewport's top edge on mobile but ~32px down inside the desktop pane.
  useEffect(() => {
    // A hidden page has no boxes: the sentinel reports an all-zero rect, which
    // reads as "scrolled past the top" and would collapse the bar while away.
    // Re-running on the way back also re-measures the bar, which a page that
    // was hidden at mount could not have done.
    if (!isTabActive) {
      setIsCollapsed(false);
      return;
    }

    const sentinel = sentinelRef.current;
    const bar = barRef.current;
    if (!sentinel || !bar || typeof IntersectionObserver === 'undefined') return;

    const barBottom = Math.max(0, Math.round(bar.getBoundingClientRect().bottom));
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only collapse when the title left past the TOP — a sentinel below the
        // fold (short pane, hidden tab) is off-screen too but must not collapse.
        const rootTop = entry.rootBounds?.top ?? 0;
        setIsCollapsed(!entry.isIntersecting && entry.boundingClientRect.top <= rootTop);
      },
      { rootMargin: `-${barBottom}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isTabActive]);

  const isPane = variant === 'pane';
  const surface = isCollapsed
    ? `${isPane ? 'bg-surface' : 'bg-app/90'} backdrop-blur-xl border-b border-border-main`
    : 'border-b border-transparent';

  const compactTitle = (
    <motion.span
      aria-hidden="true"
      initial={false}
      animate={{ opacity: isCollapsed ? 1 : 0, y: isCollapsed ? 0 : 6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="text-[17px] font-semibold text-text-main"
    >
      {t('settings')}
    </motion.span>
  );

  // The mobile page scrolls the document: App's wrapper is an overflow-y-auto
  // box that grows with its content, so it never scrolls itself yet still acts
  // as the sticky scrollport — which swallows position: sticky entirely. Fixed
  // is the only real pin there, and it goes through a portal because the tab is
  // a motion.div: while its spring runs, the transform would make it the
  // containing block and lay the bar out inside the page's px-4 column.
  const fixedBar = (
    <div
      ref={barRef}
      className={`fixed inset-x-0 top-0 z-30 pointer-events-none pt-[env(safe-area-inset-top)] transition-colors duration-200 ${surface}`}
    >
      <div style={{ height: BAR_HEIGHT }} className="flex items-center justify-center">
        {compactTitle}
      </div>
    </div>
  );

  return (
    <div className="contents">
      {isPane ? (
        <div
          ref={barRef}
          style={{ height: BAR_HEIGHT }}
          className={`sticky top-0 z-20 flex items-center justify-center transition-colors duration-200 ${surface}`}
        >
          {compactTitle}
        </div>
      ) : (
        <>
          {/* Holds the fixed bar's row open in the flow. */}
          <div aria-hidden="true" className="h-[calc(44px_+_env(safe-area-inset-top))]" />
          {typeof document === 'undefined' || !isTabActive
            ? null
            : createPortal(fixedBar, document.body)}
        </>
      )}

      {/* pb supplies the gap down to the first group: `display: contents` has no
          box, so the page's space-y never reaches this header. */}
      <div className={`pt-1 pb-5 ${isPane ? '' : 'px-1'}`}>
        <h1 className="text-[34px] leading-[1.15] font-bold tracking-[-0.02em] text-text-main">
          {t('settings')}
        </h1>
        {/* Watched instead of the title itself so the swap lands exactly as the
            last of the large title slides under the bar. */}
        <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      </div>
    </div>
  );
};
