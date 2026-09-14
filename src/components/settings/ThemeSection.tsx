import React, { useId, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check } from 'lucide-react';
import { UiTheme, UserPreferences } from '../../types';

interface ThemeOption {
  mode: UiTheme;
  key: string;
  label: string;
}

interface ThemeSectionProps {
  uiThemeOptions: ThemeOption[];
  userPreferences: UserPreferences;
  onUserPreferencesChange: (prefs: UserPreferences) => void;
  t: (key: string) => string;
}

/** The three colours a swatch needs to stand in for a whole palette. */
interface Swatch {
  bg: string;
  card: string;
  accent: string;
}

/**
 * Reads the four palettes back out of the CSSOM. They are declared once in
 * index.css; copying hex values here would silently drift the first time a
 * theme is retuned. A nested preview element cannot simply inherit them
 * either — the palette selectors only ever match :root.
 */
const readPalettes = (): Record<string, Swatch> => {
  const found: Record<string, Swatch> = {};
  if (typeof document === 'undefined') return found;

  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const { selectorText, style } = rule as CSSStyleRule;
      const bg = selectorText && style ? style.getPropertyValue('--bg-app').trim() : '';
      if (bg) {
        // Minified CSS drops the quotes, so match them optionally.
        const themed = selectorText.match(/\[data-theme=["']?([^"'\]]+)["']?\]/);
        // Light has no data-theme block of its own: it is the bare :root rule.
        const mode = themed ? themed[1] : selectorText.includes(':root') ? 'light' : '';
        if (mode) {
          found[mode] = {
            bg,
            card: style.getPropertyValue('--bg-card').trim(),
            accent: style.getPropertyValue('--accent').trim()
          };
        }
      }
      // @layer / @media wrappers hold the rules we want; a plain style rule
      // also exposes cssRules now that CSS nesting exists, hence recursing last.
      const nested = (rule as CSSGroupingRule).cssRules;
      if (nested) visit(nested);
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // Cross-origin sheet (the font CDN) — nothing of ours lives there.
    }
  }
  return found;
};

/**
 * Appearance → Theme, as an iOS grouped selection list: one 44pt row per
 * palette, a leading tile previewing that palette's real colours, and a
 * checkmark on the active row.
 */
export const ThemeSection: React.FC<ThemeSectionProps> = ({
  uiThemeOptions,
  userPreferences,
  onUserPreferencesChange,
  t
}) => {
  // Read once per mount: the stylesheet cannot change underneath us.
  const [palettes] = useState(readPalettes);
  const headingId = useId();
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number) => {
    const next = uiThemeOptions[index];
    if (!next) return;
    onUserPreferencesChange({ ...userPreferences, theme: next.mode });
    rowRefs.current[index]?.focus();
  };

  // A radiogroup promises arrow-key selection; buttons alone do not give it.
  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
        ? -1
        : 0;
    if (!step) return;
    event.preventDefault();
    const count = uiThemeOptions.length;
    select((index + step + count) % count);
  };

  const swatchBackground = (mode: UiTheme): React.CSSProperties => {
    if (mode === 'system') {
      // 'system' owns no palette — preview the two it resolves between.
      const light = palettes.light;
      const dark = palettes.dark;
      if (!light || !dark) return { background: 'var(--bg-app)' };
      return { backgroundImage: `linear-gradient(135deg, ${light.bg} 0 50%, ${dark.bg} 50% 100%)` };
    }
    return { background: palettes[mode]?.bg || 'var(--bg-app)' };
  };

  return (
    <div>
      <h4
        id={headingId}
        className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-text-muted"
      >
        {t('personalization.theme')}
      </h4>

      <div
        role="radiogroup"
        aria-labelledby={headingId}
        className="overflow-hidden rounded-xl border border-border-main bg-surface"
      >
        {uiThemeOptions.map((opt, idx) => {
          const selected = (userPreferences.theme || 'system') === opt.mode;
          const palette = palettes[opt.mode];

          return (
            <motion.button
              key={opt.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              ref={(el) => {
                rowRefs.current[idx] = el;
              }}
              tabIndex={selected ? 0 : -1}
              onKeyDown={(event) => handleKeyDown(event, idx)}
              onClick={() => onUserPreferencesChange({ ...userPreferences, theme: opt.mode })}
              whileTap={{ scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="relative flex min-h-[44px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-bg-input focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span
                aria-hidden="true"
                style={swatchBackground(opt.mode)}
                className="relative h-8 w-8 shrink-0 overflow-hidden rounded-[9px] border border-border-main"
              >
                {opt.mode !== 'system' && palette && (
                  <span
                    className="absolute inset-x-[5px] bottom-[5px] top-[11px] rounded-[3px]"
                    style={{ background: palette.card }}
                  />
                )}
                {/* No accent dot on 'system': the split already stands for both,
                    and one dot would have to pick a half to be honest about. */}
                {opt.mode !== 'system' && (
                  <span
                    className="absolute left-[5px] top-[5px] h-[7px] w-[7px] rounded-full"
                    style={{ background: palette?.accent || 'var(--accent)' }}
                  />
                )}
              </span>

              <span
                className={`min-w-0 flex-1 truncate text-[17px] text-text-main ${
                  selected ? 'font-medium' : ''
                }`}
              >
                {t(opt.key)}
              </span>

              <AnimatePresence initial={false}>
                {selected && (
                  <motion.span
                    key="check"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="shrink-0 text-accent-text"
                  >
                    <Check size={20} strokeWidth={3} aria-hidden="true" />
                  </motion.span>
                )}
              </AnimatePresence>

              {/* iOS hairline: inset to the label, and absent after the last row. */}
              {idx !== uiThemeOptions.length - 1 && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-[60px] right-0 h-px bg-border-main"
                />
              )}
            </motion.button>
          );
        })}
      </div>

      <p className="mt-2 px-1 text-[13px] leading-snug text-text-muted">
        {t('personalization.theme.footer')}
      </p>
    </div>
  );
};
