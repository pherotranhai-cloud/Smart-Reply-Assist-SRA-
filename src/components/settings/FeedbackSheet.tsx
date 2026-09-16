import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'motion/react';
import { Loader2, MessageSquareWarning } from 'lucide-react';

interface FeedbackSheetProps {
  isOpen: boolean;
  onClose: () => void;
  feedbackText: string;
  setFeedbackText: (text: string) => void;
  isSubmitting: boolean;
  onSubmit: (e?: React.FormEvent | React.MouseEvent) => void;
  t: (key: string) => string;
}

const FOCUSABLE = 'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * iOS-style bottom sheet for feedback. Slides up from the bottom edge, carries a
 * grab handle and a Cancel / Send navigation bar, and dismisses on Escape, on a
 * scrim tap, or on a downward flick of the handle.
 *
 * The scrim is a sibling inside AnimatePresence rather than a plain wrapper
 * div, which is what makes the backdrop fade back out on close.
 *
 * Rendered through a portal: SettingsPanelDesktop and LayoutDesktop apply
 * backdrop-blur when a wallpaper is set, and a backdrop-filter makes that
 * element the containing block for fixed children, which would dock the sheet
 * inside the settings card and clip it against its overflow-hidden.
 *
 * z-[10000] clears the tab bar (z-50) and the floating assistant / install
 * banner (z-[9999]), which would otherwise stay tappable over the dialog.
 */
export const FeedbackSheet: React.FC<FeedbackSheetProps> = ({
  isOpen,
  onClose,
  feedbackText,
  setFeedbackText,
  isSubmitting,
  onSubmit,
  t
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragControls = useDragControls();
  const [keyboardInset, setKeyboardInset] = useState(0);

  // Held in a ref so the effects below do not re-run when the parent passes a
  // fresh inline callback on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Wait for the slide-up before focusing, or iOS scrolls the sheet mid-flight.
    const focusTimer = window.setTimeout(() => textareaRef.current?.focus(), 250);

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
      // Reclaim focus unless something outside the sheet has already taken it —
      // submitting the admin key closes this sheet and opens the dashboard,
      // which owns focus next. AnimatePresence keeps the sheet mounted through
      // its exit spring, so at this point activeElement is usually still a
      // button inside it; testing only for body would skip the restore and drop
      // focus to the top of the page.
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body || sheetRef.current?.contains(active)) {
        previouslyFocused?.focus?.();
      }
    };
  }, [isOpen, close]);

  // A bottom-anchored fixed sheet does not move for the on-screen keyboard, so
  // lift it by however much the keyboard takes off the visual viewport.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!isOpen || !vv) return;
    const sync = () => setKeyboardInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      setKeyboardInset(0);
    };
  }, [isOpen]);

  // A flick or a long drag downwards dismisses, the way a UIKit sheet does.
  const handleDragEnd = (_e: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) close();
  };

  const canSend = !!feedbackText.trim() && !isSubmitting;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="feedback-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={close}
          className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm"
        />
      )}
      {isOpen && (
        <motion.div
          key="feedback-sheet"
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-sheet-title"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.5 }}
          onDragEnd={handleDragEnd}
          style={{ bottom: keyboardInset }}
          className="fixed inset-x-0 z-[10000] mx-auto w-full max-w-md flex flex-col max-h-[85dvh] rounded-t-2xl border-t border-x border-border-main bg-surface backdrop-blur-xl shadow-2xl"
        >
          <div
            onPointerDown={(e) => dragControls.start(e)}
            className="flex justify-center pt-3 pb-2 touch-none cursor-grab active:cursor-grabbing"
            aria-hidden="true"
          >
            <span className="h-1.5 w-10 rounded-full bg-text-muted/50" />
          </div>

          <div className="flex items-center gap-2 px-2 pb-2 border-b border-border-main">
            <button
              type="button"
              onClick={close}
              className="min-h-[44px] min-w-[44px] px-3 rounded-xl text-[17px] text-accent-text transition-colors hover:bg-border-main/30 whitespace-nowrap"
            >
              {t('feedback_cancel')}
            </button>
            <h2
              id="feedback-sheet-title"
              className="flex-1 min-w-0 text-center text-[17px] font-semibold text-text-main truncate"
            >
              {t('feedback_error_report')}
            </h2>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSend}
              className="min-h-[44px] min-w-[44px] px-3 rounded-xl text-[17px] font-semibold text-accent-text transition-colors hover:bg-border-main/30 disabled:opacity-40 disabled:hover:bg-transparent flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? t('sending') : t('send_feedback')}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 shrink-0 rounded-xl bg-accent flex items-center justify-center text-accent-on">
                <MessageSquareWarning size={18} />
              </span>
              <p className="text-[15px] leading-relaxed text-text-muted">{t('feedback_subtext')}</p>
            </div>
            <textarea
              ref={textareaRef}
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder={t('feedback_placeholder')}
              aria-label={t('feedback_error_report')}
              className="saas-input h-36 resize-none"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
