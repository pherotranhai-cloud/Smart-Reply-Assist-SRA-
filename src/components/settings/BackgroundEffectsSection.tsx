import React, { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Ban, Check, Droplets, Sparkles, Sunrise, Waves } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BackgroundEffect, UserPreferences } from '../../types';

interface BackgroundEffectsSectionProps {
  userPreferences: UserPreferences;
  onUserPreferencesChange: (prefs: UserPreferences) => void;
  t: (key: string) => string;
}

/** Ordered least to most motion, so the "off" row sits first like an iOS None row. */
const EFFECTS: { id: BackgroundEffect; Icon: LucideIcon }[] = [
  { id: 'none', Icon: Ban },
  { id: 'particles', Icon: Sparkles },
  { id: 'liquid', Icon: Droplets },
  { id: 'aurora', Icon: Sunrise },
  { id: 'waves', Icon: Waves }
];

/**
 * The background effect picker as an iOS grouped selection list: one row per
 * effect, a one-line description of what it draws, and a checkmark on the
 * selected row. Replaces a wrapping pill row whose fifth pill dropped onto its
 * own line.
 */
export const BackgroundEffectsSection: React.FC<BackgroundEffectsSectionProps> = ({
  userPreferences,
  onUserPreferencesChange,
  t
}) => {
  const headingId = useId();
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const current: BackgroundEffect = userPreferences.backgroundEffect ?? 'none';
  const selectedIndex = Math.max(0, EFFECTS.findIndex((e) => e.id === current));

  const select = (index: number) => {
    rowRefs.current[index]?.focus();
    const next = EFFECTS[index];
    if (!next || next.id === current) return;
    onUserPreferencesChange({ ...userPreferences, backgroundEffect: next.id });
  };

  // Arrow keys clamp at the ends instead of wrapping: settings auto-save on
  // every change, so a held key on a wrapping list would write storage forever.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = selectedIndex;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = Math.min(selectedIndex + 1, EFFECTS.length - 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = Math.max(selectedIndex - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = EFFECTS.length - 1;
    else return;
    e.preventDefault();
    select(next);
  };

  return (
    <div className="w-full">
      <h4
        id={headingId}
        className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted"
      >
        <Sparkles size={13} />
        {t('personalization.effects')}
      </h4>

      <div
        role="radiogroup"
        aria-labelledby={headingId}
        onKeyDown={handleKeyDown}
        className="overflow-hidden rounded-xl border border-border-main bg-surface"
      >
        {EFFECTS.map(({ id, Icon }, i) => {
          const selected = id === current;
          return (
            <button
              key={id}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              // Roving tab order: only the selected row is in the tab sequence.
              tabIndex={i === selectedIndex ? 0 : -1}
              onClick={() => select(i)}
              className="relative flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left transition-colors focus-visible:bg-bg-input focus-visible:outline-none active:bg-bg-input"
            >
              {/* Hairline inset to the label, iOS style — none above the first row. */}
              {i > 0 && <span aria-hidden="true" className="absolute left-[3.25rem] right-0 top-0 h-px bg-border-main" />}

              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  selected ? 'bg-accent text-accent-on' : 'bg-bg-input text-text-muted'
                }`}
              >
                <Icon size={15} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] leading-tight text-text-main">
                  {t(`personalization.effect.${id}`)}
                </span>
                <span className="mt-0.5 block truncate text-[12px] leading-snug text-text-muted">
                  {t(`personalization.effect.${id}.desc`)}
                </span>
              </span>

              <AnimatePresence initial={false}>
                {selected && (
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
            </button>
          );
        })}
      </div>

      {/* Deliberately does not promise reduced-motion handling: BackgroundCanvas
          has no prefers-reduced-motion check today (review R3). */}
      <p className="mt-2 px-1 text-[12px] leading-snug text-text-muted">
        {t('personalization.effects.footer')}
      </p>
    </div>
  );
};
