import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Languages, PenTool, BookOpen, Settings, CheckCircle2, AlertCircle, X, History, Mic } from 'lucide-react';
import { UserPreferences } from '../types';
import { TabType } from '../hooks/useTabNavigation';
import { useSwipeTabs } from '../hooks/useSwipeTabs';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  toast: { message: string; type: 'info' | 'error' | 'success' } | null;
  onCloseToast: () => void;
  t: (key: string) => string;
  userPreferences?: UserPreferences;
}

export const LayoutMobile: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab, 
  toast, 
  onCloseToast,
  t,
  userPreferences
}) => {
  // Horizontal swipe between tabs, wired to the surface around {children}.
  const swipe = useSwipeTabs(activeTab as TabType, setActiveTab);

  // The bar's height is not a constant anyone can hardcode: it is pt-1 plus a
  // NavItem plus max(env(safe-area-inset-bottom), 0.5rem), so it moves with the
  // user's text size and with the safe-area inset. Publish what it actually
  // measures as --tab-bar-h and let anything docked above it read that.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--tab-bar-h', `${nav.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      // The desktop layout has no tab bar, so leaving a stale height behind
      // would push its own fixed children up by a bar that is not there.
      root.style.removeProperty('--tab-bar-h');
    };
  }, []);

  const handleTabClick = (tab: string) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }
    setActiveTab(tab);
  };

  const hasBgImage = !!userPreferences?.backgroundImage;

  return (
    <div className={`flex flex-col min-h-screen text-text-main transition-colors duration-500 ${
      hasBgImage ? 'bg-transparent' : 'bg-app'
    }`}>
      {/* Main Content */}
      <motion.main 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 flex flex-col pb-20 max-w-2xl mx-auto w-full px-4 pt-6"
      >
        {/* Swipe surface. Restricting touch-action leaves vertical scrolling
            and pinch-zoom to the browser while stopping it from swallowing
            horizontal gestures; dragDirectionLock then decides which axis the
            finger meant. */}
        <motion.div
          ref={swipe.surfaceRef}
          drag="x"
          dragListener={false}
          dragControls={swipe.dragControls}
          dragDirectionLock
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={swipe.dragElastic}
          dragMomentum={false}
          dragTransition={{ bounceStiffness: 300, bounceDamping: 30 }}
          onPointerDown={swipe.onPointerDown}
          onDirectionLock={swipe.onDirectionLock}
          onDragEnd={swipe.onDragEnd}
          className="flex-1 flex flex-col [touch-action:pan-y_pinch-zoom]"
        >
          {children}
        </motion.div>
      </motion.main>

      {/* Bottom Navigation - edge-to-edge iOS tab bar: one translucent material
          plate over --ios-glass-bg, with a hairline separator on top.
          The hairline is border-strong at 40% because neither obvious token
          works in all four themes: --ios-glass-border is white at 0.3 alpha
          (invisible on the light bar) and --border-main sits within ~1.1:1 of
          the bar colour on the three dark ones.
          env(safe-area-inset-bottom) stays 0 until index.html's viewport meta
          gains viewport-fit=cover, so the max() holds a floor in the meantime. */}
      <nav ref={navRef} className="ios-glass fixed bottom-0 left-0 right-0 z-50 border-x-0 border-b-0 border-t-border-strong/40 pt-1 pb-[max(env(safe-area-inset-bottom),0.5rem)] transition-colors duration-300">
        <div className="mx-auto flex w-full max-w-2xl items-stretch justify-around">
          <NavItem
            icon={<Languages className="w-6 h-6" />}
            label={t('nav_translate')}
            ariaLabel={t('translate')}
            active={activeTab === 'translate'}
            onClick={() => handleTabClick('translate')}
          />
          <NavItem
            icon={<Mic className="w-6 h-6" />}
            label={t('nav_talk')}
            ariaLabel={t('live_translate')}
            active={activeTab === 'talk'}
            onClick={() => handleTabClick('talk')}
          />
          <NavItem
            icon={<PenTool className="w-6 h-6" />}
            label={t('nav_compose')}
            ariaLabel={t('compose')}
            active={activeTab === 'compose'}
            onClick={() => handleTabClick('compose')}
          />
          <NavItem
            icon={<BookOpen className="w-6 h-6" />}
            label={t('nav_vocab')}
            ariaLabel={t('vocab')}
            active={activeTab === 'vocab'}
            onClick={() => handleTabClick('vocab')}
          />
          {/* History alone uses the short key for its accessible name too:
              t('history') is missing from both zh dictionaries and falls back to
              English, which would leave the accessible name not containing the
              visible label (WCAG 2.5.3). nav_history is defined in all four. */}
          <NavItem
            icon={<History className="w-6 h-6" />}
            label={t('nav_history')}
            ariaLabel={t('nav_history')}
            active={activeTab === 'history'}
            onClick={() => handleTabClick('history')}
          />
          <NavItem
            icon={<Settings className="w-6 h-6" />}
            label={t('nav_settings')}
            ariaLabel={t('settings')}
            active={activeTab === 'settings'}
            onClick={() => handleTabClick('settings')}
          />
        </div>
      </nav>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-[calc(var(--tab-bar-h)_+_0.5rem)] left-4 right-4 z-[100] flex justify-center pointer-events-none"
          >
            <div className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-sm flex items-center gap-3 border backdrop-blur-xl min-w-[280px] ${
              toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 
              toast.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' :
              'bg-[#006D77]/10 border-[#006D77]/20 text-[#006D77]'
            }`}>
              {toast.type === 'success' ? <CheckCircle2 size={18} /> : 
               toast.type === 'error' ? <AlertCircle size={18} /> : null}
              <span className="text-sm font-medium flex-1">{toast.message}</span>
              <button onClick={onCloseToast} className="p-1 hover:bg-black/5 rounded-full transition-colors">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// One tab: a 24px glyph over a 10px SF-style label, on a 44pt minimum target.
// min-w-[44px] also removes the automatic flex minimum, so a long label
// truncates instead of widening the row - six tabs still fit at 320px.
const NavItem = ({ icon, label, ariaLabel, active, onClick }: {
  icon: React.ReactNode,
  label: string,
  ariaLabel: string,
  active: boolean,
  onClick: () => void
}) => (
  <button
    type="button"
    onClick={onClick}
    title={ariaLabel}
    aria-label={ariaLabel}
    aria-current={active ? 'page' : undefined}
    className={`relative flex flex-1 min-w-[44px] min-h-[44px] flex-col items-center justify-center gap-0.5 px-0.5 pt-2 pb-1 transition-colors duration-200 active:opacity-60 ${
      active ? 'text-accent-text' : 'text-text-muted'
    }`}
  >
    {icon}
    {/* Pinned at 10px so the row keeps fitting when the user scales body text. */}
    <span className="w-full truncate text-center text-[10px] font-medium leading-tight tracking-tight">
      {label}
    </span>

    {/* Shared-element marker that springs across to the tab being selected */}
    {active && (
      <motion.div
        layoutId="activeTabIndicator"
        className="absolute top-1 w-1 h-1 rounded-full bg-accent-text"
        initial={false}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    )}
  </button>
);
