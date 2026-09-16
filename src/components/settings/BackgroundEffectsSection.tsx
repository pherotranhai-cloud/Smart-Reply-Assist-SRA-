import React, { useId, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
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
  const uid = useId();
  const headingId = `${uid}heading`;
  const footerId = `${uid}footer`;
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const reduceMotion = useReducedMotion();

  // Preferences come straight out of localStorage unvalidated, so a stored value
  // we no longer know draws nothing — show it as None rather than as a group
  // where every row reports aria-checked="false".
  const storedIndex = EFFECTS.findIndex((e) => e.id === userPreferences.backgroundEffect);
  const activeIndex = storedIndex === -1 ? 0 : storedIndex;
  const current = EFFECTS[activeIndex].id;

  const select = (index: number, moveFocus = false) => {
    const next = EFFECTS[index];
    if (moveFocus) rowRefs.current[index]?.focus();
    if (!next || next.id === current) return;
    onUserPreferencesChange({ ...userPreferences, backgroundEffect: next.id });
  };

  // Arrow keys clamp at the ends instead of wrapping: settings auto-save on
  // every change, so a held key on a wrapping list would write storage forever.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = activeIndex;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = Math.min(activeIndex + 1, EFFECTS.length - 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = Math.max(activeIndex - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = EFFECTS.length - 1;
    else return;
    e.preventDefault();
    select(next, true);
  };

  return (
    <div className="w-full">
      <h4
        id={headingId}
        className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted"
      >
        <Sparkles size={13} aria-hidden="true" />
        {t('personalization.effects')}
      </h4>

      <div
        role="radiogroup"
        aria-labelledby={headingId}
        aria-describedby={footerId}
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
              tabIndex={i === activeIndex ? 0 : -1}
              onClick={() => select(i)}
              className="relative flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent active:bg-bg-input"
            >
              {/* Hairline inset to the label, iOS style — none above the first row. */}
              {i > 0 && <span aria-hidden="true" className="absolute left-[3.25rem] right-0 top-0 h-px bg-border-main" />}

              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  selected ? 'bg-accent text-accent-on' : 'bg-bg-input text-text-muted'
                }`}
              >
                <Icon size={15} aria-hidden="true" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] leading-tight text-text-main">
                  {t(`personalization.effect.${id}`)}
                </span>
                <span className="mt-0.5 block truncate text-[12px] leading-snug text-text-muted">
                  {t(`personalization.effect.${id}.desc`)}
                </span>
              </span>

              {/* Slot is always there so selecting a row does not narrow its own label. */}
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center text-accent-text">
                {selected && (
                  <motion.span
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  >
                    <Check size={18} strokeWidth={3} aria-hidden="true" />
                  </motion.span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Deliberately does not promise reduced-motion handling: BackgroundCanvas
          has no prefers-reduced-motion check today (review R3). */}
      <p id={footerId} className="mt-2 px-1 text-[12px] leading-snug text-text-muted">
        {t('personalization.effects.footer')}
      </p>
    </div>
  );
};
