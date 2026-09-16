import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, History, RotateCcw, type LucideIcon } from 'lucide-react';

interface SystemSectionProps {
  t: (key: string) => string;
  handleResetApp: () => void;
  handleClearHistory: () => void;
}

/**
 * Destructive red is the one literal colour in this file: it has to read as
 * danger in all four palettes, so it cannot come from an accent token. red-600
 * clears AA on the light surface (4.83:1) but only 2.8-4.0:1 on the three dark
 * palettes, so those step up to red-400 (6.0:1 dark, 7.0:1 cyberpunk, 4.8:1
 * industrial). Keyed off data-theme rather than Tailwind's `dark:`, which in v4
 * is a prefers-color-scheme media query and would ignore a chosen palette.
 */
const DANGER_TEXT =
  'text-red-600 [[data-theme=dark]_&]:text-red-400 [[data-theme=cyberpunk]_&]:text-red-400 [[data-theme=industrial]_&]:text-red-400';

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/** Which destructive action the sheet is currently confirming. */
type ActionId = 'reset' | 'clearHistory';

interface SystemRow {
  id: ActionId;
  icon: LucideIcon;
  /** i18n key for the row label, reused as the sheet title. */
  labelKey: string;
  /** i18n key for the sentence naming what the action destroys. */
  messageKey: string;
  /** i18n key for the red button inside the sheet. */
  confirmKey: string;
  /** iOS tints the label red only when the row is itself the destructive one. */
  dangerLabel: boolean;
}

const ROWS: SystemRow[] = [
  {
    id: 'reset',
    icon: RotateCcw,
    labelKey: 'resetApp',
    messageKey: 'system.reset_message',
    confirmKey: 'system.reset_confirm',
    dangerLabel: false
  },
  {
    id: 'clearHistory',
    icon: History,
    labelKey: 'clearHistory',
    messageKey: 'system.clear_history_message',
    confirmKey: 'system.clear_history_confirm',
    dangerLabel: true
  }
];

interface ActionSheetProps {
  row: SystemRow | null;
  onCancel: () => void;
  onConfirm: () => void;
  t: (key: string) => string;
}

/**
 * iOS action sheet: a titled group carrying the destructive button, with Cancel
 * as a detached group below it.
 *
 * Rendered through a portal. SettingsPanelDesktop and LayoutDesktop apply
 * backdrop-blur when a wallpaper is set, and a backdrop-filter makes that
 * element the containing block for fixed children, which would dock the sheet
 * inside the settings card and clip it against its overflow-hidden.
 *
 * z-[10000] clears the tab bar (z-50) and the floating assistant / install
 * banner (z-[9999]), which would otherwise stay tappable over the dialog.
 */
const ActionSheet: React.FC<ActionSheetProps> = ({ row, onCancel, onConfirm, t }) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  const isOpen = !!row;

  // Held in a ref so the effect below does not re-run when the parent passes a
  // fresh inline callback on every render.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const close = useCallback(() => onCancelRef.current(), []);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Cancel takes focus, never the destructive button: Enter on an
    // auto-focused red button would wipe the data on a single keystroke.
    // Deferred past the slide-up, or iOS scrolls the sheet mid-flight.
    const focusTimer = window.setTimeout(() => cancelRef.current?.focus(), 250);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab' || !sheetRef.current) return;
      // Keep Tab inside the dialog.
      const nodes = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      // Reclaim focus unless something outside the sheet has already taken it.
      // AnimatePresence keeps the sheet mounted through its exit spring, so at
      // this point activeElement is usually still a button inside it — testing
      // only for body would skip the restore and drop focus to the top of the page.
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body || sheetRef.current?.contains(active)) {
        previouslyFocused?.focus?.();
      }
    };
  }, [isOpen, close]);

  return createPortal(
    <AnimatePresence>
      {row && (
        <motion.div
          key="system-sheet-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={close}
          className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
        />
      )}
      {row && (
        <motion.div
          key="system-sheet"
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={messageId}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed inset-x-0 bottom-0 z-[10000] mx-auto w-full max-w-md flex flex-col gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          <div className="rounded-2xl overflow-hidden border border-border-main bg-surface backdrop-blur-xl shadow-2xl">
            <div className="px-4 py-3 text-center border-b border-border-main">
              <h2 id={titleId} className="text-[15px] font-semibold text-text-main">
                {t(row.labelKey)}
              </h2>
              <p id={messageId} className="mt-1 text-[13px] leading-relaxed text-text-muted">
                {t(row.messageKey)}
              </p>
            </div>
            <button
              type="button"
              onClick={onConfirm}
              className={`w-full min-h-[56px] px-4 text-[17px] font-semibold transition-colors hover:bg-border-main/30 active:bg-border-main/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${DANGER_TEXT}`}
            >
              {t(row.confirmKey)}
            </button>
          </div>

          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            className="w-full min-h-[56px] px-4 rounded-2xl border border-border-main bg-surface backdrop-blur-xl shadow-2xl text-[17px] font-semibold text-accent-text transition-colors hover:bg-border-main/30 active:bg-border-main/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            {t('system.cancel')}
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

/**
 * iOS-style grouped list for the destructive system actions. Neither row acts on
 * the tap itself — both open an action sheet first, because resetting the app
 * and clearing the history are unrecoverable.
 */
export const SystemSection: React.FC<SystemSectionProps> = ({ t, handleResetApp, handleClearHistory }) => {
  const [pending, setPending] = useState<SystemRow | null>(null);
  const headingId = useId();

  const handleConfirm = () => {
    const id = pending?.id;
    setPending(null);
    if (id === 'reset') handleResetApp();
    else if (id === 'clearHistory') handleClearHistory();
  };

  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="text-[11px] font-medium text-text-muted uppercase tracking-widest px-4 mb-2"
      >
        {t('system')}
      </h3>
      {/* bg-surface is already theme- and wallpaper-correct, so no hasBgImage
          branch is needed — see the same note in TalkTabDesktop. */}
      <div className="rounded-xl overflow-hidden shadow-sm border border-border-main bg-surface backdrop-blur-xl">
        {ROWS.map((row, idx) => {
          const TileIcon = row.icon;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setPending(row)}
              className="w-full flex items-stretch gap-3 pl-4 text-left transition-colors hover:bg-border-main/20 active:bg-border-main/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <span className="flex items-center shrink-0">
                {/* text-white on the red fill: 3.77:1, above the 3:1 bar for a
                    non-text glyph, and identical in every palette. */}
                <span className="w-7 h-7 rounded-md bg-red-500 flex items-center justify-center text-white">
                  <TileIcon size={16} />
                </span>
              </span>
              {/* Hairline lives on the content, so it insets to the label like iOS. */}
              <span
                className={`flex-1 min-w-0 flex items-center justify-between gap-3 pr-4 py-2 min-h-[52px] ${
                  idx !== ROWS.length - 1 ? 'border-b border-border-main' : ''
                }`}
              >
                <span
                  className={`min-w-0 truncate text-[17px] ${
                    row.dangerLabel ? `font-medium ${DANGER_TEXT}` : 'text-text-main'
                  }`}
                >
                  {t(row.labelKey)}
                </span>
                <ChevronRight size={20} className="shrink-0 text-text-muted" />
              </span>
            </button>
          );
        })}
      </div>

      <ActionSheet row={pending} onCancel={() => setPending(null)} onConfirm={handleConfirm} t={t} />
    </section>
  );
};
