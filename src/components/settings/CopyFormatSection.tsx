import React, { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ClipboardType } from 'lucide-react';
import { CopyFormat, UserPreferences } from '../../types';
import { formatForCopy } from '../../utils/richText';

/**
 * The four ways a copy can render the model's `**bold**`. Order runs from the
 * safest to the most literal, so the default sits first.
 */
const COPY_FORMAT_OPTIONS: { id: CopyFormat; labelKey: string; captionKey: string }[] = [
  { id: 'plain', labelKey: 'copyFormat.plain', captionKey: 'copyFormat.plain.caption' },
  { id: 'unicode', labelKey: 'copyFormat.unicode', captionKey: 'copyFormat.unicode.caption' },
  { id: 'uppercase', labelKey: 'copyFormat.uppercase', captionKey: 'copyFormat.uppercase.caption' },
  { id: 'markdown', labelKey: 'copyFormat.markdown', captionKey: 'copyFormat.markdown.caption' }
];

interface CopyFormatSectionProps {
  userPreferences: UserPreferences;
  onUserPreferencesChange: (prefs: UserPreferences) => void;
  t: (key: string) => string;
}

/**
 * Settings → Copy Format. The copy buttons used to hand the raw Markdown to the
 * clipboard, which is why a paste into Zalo or WeChat showed `**` around the
 * words meant to be bold. This is where that is chosen, with a preview of the
 * pasted result: the sample deliberately mixes Vietnamese with a product code,
 * since the Unicode bold alphabet can only reach the second one.
 */
export const CopyFormatSection: React.FC<CopyFormatSectionProps> = ({
  userPreferences,
  onUserPreferencesChange,
  t
}) => {
  const headingId = useId();
  const footerId = useId();
  const previewId = useId();
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selected = userPreferences.copyFormat ?? 'plain';
  const selectedIndex = Math.max(
    0,
    COPY_FORMAT_OPTIONS.findIndex((o) => o.id === selected)
  );

  const setFormat = (copyFormat: CopyFormat) =>
    onUserPreferencesChange({ ...userPreferences, copyFormat });

  // Arrow keys move and select, per the ARIA radiogroup pattern, clamped at the
  // ends the way ModelSection does it — every move writes through to storage.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const step =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? 1
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = idx + step;
    if (next < 0 || next >= COPY_FORMAT_OPTIONS.length) return;
    setFormat(COPY_FORMAT_OPTIONS[next].id);
    rowRefs.current[next]?.focus();
  };

  const preview = formatForCopy(t('copyFormat.sample'), selected).text;

  return (
    <section>
      <h3
        id={headingId}
        className="text-[11px] font-medium text-text-muted uppercase tracking-widest px-4 mb-2 flex items-center gap-2"
      >
        <ClipboardType size={14} className="text-accent-text" />
        {t('copyFormat')}
      </h3>

      <div
        role="radiogroup"
        aria-labelledby={headingId}
        aria-describedby={footerId}
        className="rounded-xl overflow-hidden shadow-sm border border-border-main transition-all duration-300 bg-surface backdrop-blur-xl"
      >
        {COPY_FORMAT_OPTIONS.map((opt, idx) => {
          const isSelected = selected === opt.id;
          return (
            <button
              key={opt.id}
              ref={(el) => {
                rowRefs.current[idx] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={idx === selectedIndex ? 0 : -1}
              onClick={() => setFormat(opt.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className="w-full flex items-stretch gap-3 pl-4 text-left transition-colors hover:bg-border-main/20 active:bg-border-main/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              {/* Hairline lives on the content, so it insets to the label like iOS. */}
              <span
                className={`flex-1 min-w-0 flex items-center justify-between gap-3 pr-4 py-2 min-h-[52px] ${
                  idx !== COPY_FORMAT_OPTIONS.length - 1 ? 'border-b border-border-main' : ''
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] text-text-main">{t(opt.labelKey)}</span>
                  <span className="block text-[13px] text-text-muted">{t(opt.captionKey)}</span>
                </span>
                <AnimatePresence initial={false}>
                  {isSelected && (
                    <motion.span
                      key="check"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      className="shrink-0 text-accent-text"
                    >
                      <Check size={18} strokeWidth={3} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </button>
          );
        })}
      </div>

      {/* The preview is the real conversion, not a mock-up: it runs the sample
          through the same function the copy buttons use. */}
      <div className="mt-3 rounded-xl border border-border-main bg-surface overflow-hidden">
        <div className="px-4 py-2 border-b border-border-main">
          <span id={previewId} className="text-[11px] font-medium text-text-muted uppercase tracking-widest">
            {t('copyFormat.preview')}
          </span>
        </div>
        <p
          aria-labelledby={previewId}
          aria-live="polite"
          className="px-4 py-3 text-[15px] leading-relaxed text-text-main whitespace-pre-wrap break-words"
        >
          {preview}
        </p>
      </div>

      <p id={footerId} className="text-[12px] text-text-muted px-4 mt-2">
        {t('copyFormat.footer')}
      </p>
    </section>
  );
};
