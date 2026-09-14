import React, { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check } from 'lucide-react';
import { UserPreferences } from '../../types';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

/**
 * The four faces, in one place — both panels used to carry their own copy of
 * this array. `preview` is the same class App.tsx puts on <html>, so each row
 * previews exactly what picking it will do.
 */
const FONT_OPTIONS = [
  { id: 'sans', key: 'personalization.font.sans', preview: 'font-custom-sans' },
  { id: 'mono', key: 'personalization.font.mono', preview: 'font-custom-mono' },
  { id: 'serif', key: 'personalization.font.serif', preview: 'font-custom-serif' },
  { id: 'playfair', key: 'personalization.font.playfair', preview: 'font-custom-fancy' }
] as const;

/**
 * Four stops only. `px` mirrors the text-sm|base|lg|xl App.tsx applies, so the
 * preview line is the real size rather than an approximation. UserPreferences
 * also declares 'md', but nothing reads it — no stop for it here.
 */
const SIZE_OPTIONS = [
  { id: 'sm', key: 'personalization.fontSize.sm', px: 14 },
  { id: 'base', key: 'personalization.fontSize.base', px: 16 },
  { id: 'lg', key: 'personalization.fontSize.lg', px: 18 },
  { id: 'xl', key: 'personalization.fontSize.xl', px: 20 }
] as const;

type FontId = (typeof FONT_OPTIONS)[number]['id'];
type SizeId = (typeof SIZE_OPTIONS)[number]['id'];

/**
 * Roving arrow-key movement inside a radiogroup: moves selection to the
 * neighbouring stop and carries focus with it, as WAI-ARIA expects.
 */
function moveRadio(
  e: React.KeyboardEvent,
  index: number,
  count: number,
  pick: (next: number) => void,
  refs: React.MutableRefObject<(HTMLButtonElement | null)[]>
) {
  const delta =
    e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;

  let next = -1;
  if (delta !== 0) next = (index + delta + count) % count;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = count - 1;
  if (next < 0) return;

  e.preventDefault();
  pick(next);
  refs.current[next]?.focus();
}

interface TypographySectionProps {
  userPreferences: UserPreferences;
  onUserPreferencesChange: (prefs: UserPreferences) => void;
  t: (key: string) => string;
}

/**
 * Appearance → Typography: an iOS selection list for the face and an iOS
 * text-size track for the scale. Both write straight through — settings
 * auto-save, so there is no commit step.
 */
export const TypographySection: React.FC<TypographySectionProps> = ({
  userPreferences,
  onUserPreferencesChange,
  t
}) => {
  const uid = useId();
  const fontLabelId = `${uid}-font`;
  const sizeLabelId = `${uid}-size`;

  const fontRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const sizeRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeFont = FONT_OPTIONS.find((o) => o.id === userPreferences.fontFamily) ?? FONT_OPTIONS[0];
  // App.tsx renders any size it does not recognise — the dead 'md' included —
  // at text-base, so an unknown value has to land on 'base' here too, not on
  // the first stop, or the knob would disagree with the page.
  const storedSizeIndex = SIZE_OPTIONS.findIndex((o) => o.id === userPreferences.fontSize);
  const activeSizeIndex = storedSizeIndex < 0 ? SIZE_OPTIONS.findIndex((o) => o.id === 'base') : storedSizeIndex;
  const activeSize = SIZE_OPTIONS[activeSizeIndex];

  const setFont = (fontFamily: FontId) => onUserPreferencesChange({ ...userPreferences, fontFamily });
  const setSize = (fontSize: SizeId) => onUserPreferencesChange({ ...userPreferences, fontSize });

  return (
    <div className="space-y-5">
      {/* Font family — one 44pt row per face, each label set in its own type */}
      <div className="space-y-2">
        <span id={fontLabelId} className="text-[13px] font-medium text-text-muted block">
          {t('personalization.font')}
        </span>

        <div
          role="radiogroup"
          aria-labelledby={fontLabelId}
          className="rounded-xl border border-border-main bg-surface overflow-hidden"
        >
          {FONT_OPTIONS.map((opt, i) => {
            const selected = activeFont.id === opt.id;
            return (
              <React.Fragment key={opt.id}>
                {/* Hairline inset to the label edge, the way iOS separates rows */}
                {i > 0 && <div aria-hidden="true" className="h-px bg-border-main ml-4" />}
                <motion.button
                  ref={(el) => {
                    fontRefs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setFont(opt.id)}
                  onKeyDown={(e) =>
                    moveRadio(e, i, FONT_OPTIONS.length, (n) => setFont(FONT_OPTIONS[n].id), fontRefs)
                  }
                  whileTap={{ scale: 0.99 }}
                  transition={SPRING}
                  className={`w-full min-h-[52px] flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                    selected ? 'bg-accent/5' : 'hover:bg-bg-input'
                  }`}
                >
                  <span className={`text-[17px] leading-snug truncate text-text-main ${opt.preview}`}>
                    {t(opt.key)}
                  </span>
                  <AnimatePresence initial={false}>
                    {selected && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={SPRING}
                        className="shrink-0 text-accent-text"
                      >
                        <Check size={18} strokeWidth={3} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Text size — live preview over a tick track, small A to large A */}
      <div className="space-y-2">
        {/* Value on the right, iOS-style: the stops are unlabelled tick marks,
            so this is the only place the chosen step is named on screen. */}
        <div className="flex items-baseline justify-between gap-2">
          <span id={sizeLabelId} className="text-[13px] font-medium text-text-muted block">
            {t('personalization.fontSize')}
          </span>
          <span className="text-[13px] text-text-muted truncate">{t(activeSize.key)}</span>
        </div>

        <div className="rounded-xl border border-border-main bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-border-main">
            <motion.p
              // initial={false} so the sample does not grow in on first paint
              initial={false}
              animate={{ fontSize: `${activeSize.px}px` }}
              transition={SPRING}
              className={`text-text-main leading-snug ${activeFont.preview}`}
            >
              {t('personalization.fontSize.preview')}
            </motion.p>
          </div>

          <div className="flex items-center gap-2 px-3 py-2">
            <span aria-hidden="true" className={`shrink-0 text-[13px] text-text-muted ${activeFont.preview}`}>
              A
            </span>

            <div role="radiogroup" aria-labelledby={sizeLabelId} className="relative flex flex-1 items-stretch">
              {/* Rail behind the stops. The four stops split the row evenly, so
                  their centres sit at 12.5% and 87.5% — the rail ends there. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-border-main"
              />
              {SIZE_OPTIONS.map((opt, i) => {
                const selected = activeSizeIndex === i;
                return (
                  // Each stop owns a full 44px column, so the tick mark is
                  // decorative and the whole quarter is the hit area.
                  <button
                    key={opt.id}
                    ref={(el) => {
                      sizeRefs.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={t(opt.key)}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setSize(opt.id)}
                    onKeyDown={(e) =>
                      moveRadio(e, i, SIZE_OPTIONS.length, (n) => setSize(SIZE_OPTIONS[n].id), sizeRefs)
                    }
                    className="relative flex-1 min-w-11 h-11 flex items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {!selected && <span aria-hidden="true" className="w-[3px] h-3 rounded-full bg-border-strong" />}
                    {selected && (
                      <motion.span
                        aria-hidden="true"
                        layoutId={`${uid}-size-knob`}
                        transition={SPRING}
                        className="absolute w-7 h-7 rounded-full bg-accent shadow-sm"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <span aria-hidden="true" className={`shrink-0 text-[22px] leading-none text-text-muted ${activeFont.preview}`}>
              A
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
