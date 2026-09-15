import React, { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Cpu, Gauge, Sparkles, Zap, LucideIcon } from 'lucide-react';
import { SUPPORTED_MODELS } from '../../constants';

interface ModelSectionProps {
  /** Currently selected model id, from localSettings.openai.model. */
  model: string;
  /** Writes through useSettingsPanel's updateCurrent — Settings auto-saves, no Save button. */
  onSelectModel: (model: string) => void;
  t: (key: string) => string;
}

// GPT-5.6 Luna is the only id with a distinct display name; the rest show their id.
const displayName = (modelId: string) => (modelId === 'gpt-5.6-luna' ? 'GPT-5.6 Luna' : modelId);

// Per-model leading tile icon and the key of its one-line capability subtitle.
// Model names are proper nouns and stay untranslated; the subtitles do not.
// Keep every translation under ~30 characters — the row truncates at 320px.
const MODEL_META: Record<string, { icon: LucideIcon; captionKey: string }> = {
  'gpt-5.6-luna': { icon: Sparkles, captionKey: 'model.capability.luna' },
  'gpt-4o': { icon: Zap, captionKey: 'model.capability.gpt4o' },
  'gpt-3.5-turbo': { icon: Gauge, captionKey: 'model.capability.gpt35' },
};

/**
 * iOS-style grouped selection list for the AI model: one row per model, a
 * checkmark on the selected one. Identical on mobile and desktop — the card grid
 * it replaces split into one column / two columns for no reason.
 */
export const ModelSection: React.FC<ModelSectionProps> = ({ model, onSelectModel, t }) => {
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const headingId = useId();
  const footerId = useId();

  // Roving tabIndex: the selected row is the group's single tab stop. An unknown
  // model id (nothing selected) falls back to the first row so the group stays reachable.
  const selectedIndex = SUPPORTED_MODELS.indexOf(model as (typeof SUPPORTED_MODELS)[number]);
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;

  // Arrow keys move and select, per the ARIA radiogroup pattern. Selection is
  // clamped rather than wrapped so holding a key cannot cycle the list — every
  // move auto-saves, and cycling would churn storage.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1
      : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1
      : 0;
    if (!step) return;
    e.preventDefault();
    const next = idx + step;
    if (next < 0 || next >= SUPPORTED_MODELS.length) return;
    onSelectModel(SUPPORTED_MODELS[next]);
    rowRefs.current[next]?.focus();
  };

  return (
    <section>
      <h3
        id={headingId}
        className="text-[11px] font-medium text-text-muted uppercase tracking-widest px-4 mb-2 flex items-center gap-2"
      >
        <Cpu size={14} className="text-accent-text" />
        {t('model')}
      </h3>
      {/* bg-surface is already theme- and wallpaper-correct, so no hasBgImage
          branch is needed — see the same note in TalkTabDesktop. */}
      <div
        role="radiogroup"
        aria-labelledby={headingId}
        aria-describedby={footerId}
        className="rounded-xl overflow-hidden shadow-sm border border-border-main transition-all duration-300 bg-surface backdrop-blur-xl"
      >
        {SUPPORTED_MODELS.map((modelId, idx) => {
          const isSelected = model === modelId;
          const meta = MODEL_META[modelId];
          const TileIcon = meta?.icon ?? Cpu;
          return (
            <button
              key={modelId}
              ref={(el) => { rowRefs.current[idx] = el; }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={idx === tabStop ? 0 : -1}
              onClick={() => onSelectModel(modelId)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className="w-full flex items-stretch gap-3 pl-4 text-left transition-colors hover:bg-border-main/20 active:bg-border-main/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <span className="flex items-center shrink-0">
                <span className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-accent-on">
                  <TileIcon size={16} />
                </span>
              </span>
              {/* Hairline lives on the content, so it insets to the label like iOS. */}
              <span
                className={`flex-1 min-w-0 flex items-center justify-between gap-3 pr-4 py-2 min-h-[52px] ${
                  idx !== SUPPORTED_MODELS.length - 1 ? 'border-b border-border-main' : ''
                }`}
              >
                {/* min-w-0 lets both lines truncate instead of overflowing at 320px. */}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] text-text-main">{displayName(modelId)}</span>
                  {meta && (
                    <span className="block truncate text-[13px] text-text-muted">{t(meta.captionKey)}</span>
                  )}
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
      <p id={footerId} className="text-[12px] text-text-muted px-4 mt-2">{t('model.footer')}</p>
    </section>
  );
};
