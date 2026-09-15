import React, { useRef } from 'react';
import { Check, Languages } from 'lucide-react';
import { GlobalLanguage } from '../../types';

/**
 * English exonyms for the native labels, used as the row subtitle so a reader
 * who cannot parse a script can still find their language. Language names are
 * proper nouns and never go through i18n (appearance-system-review §3, R2).
 */
const ENGLISH_NAMES: Record<GlobalLanguage, string> = {
  en: 'English',
  vi: 'Vietnamese',
  'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)'
};

interface LanguageSectionProps {
  languageOptions: { lang: GlobalLanguage; label: string }[];
  globalLanguage: GlobalLanguage;
  onLanguageChange: (lang: GlobalLanguage) => void;
  t: (key: string) => string;
  /**
   * Desktop stacks this card on top of the user's wallpaper. --bg-card is
   * already translucent there, so the card switches to the opaque surface
   * token instead of stacking another fractional alpha on it.
   */
  overWallpaper?: boolean;
}

/**
 * iOS-style single-select language list: one row per language, native name as
 * the label, checkmark on the selected row, hairlines inset to the label.
 */
export const LanguageSection: React.FC<LanguageSectionProps> = ({
  languageOptions,
  globalLanguage,
  onLanguageChange,
  t,
  overWallpaper = false
}) => {
  const groupRef = useRef<HTMLDivElement>(null);
  const heading = t('interfaceLanguage');

  // The checked row carries the group's single tab stop; if the stored value is
  // unknown, the first row does, so the list is never unreachable by keyboard.
  const checkedIndex = languageOptions.findIndex(opt => opt.lang === globalLanguage);
  const tabStopIndex = checkedIndex === -1 ? 0 : checkedIndex;

  /**
   * Arrow/Home/End walk the group like a native radio group: selection follows
   * focus, which is what a radiogroup announces to assistive tech. Because the
   * checked row is also the group's tab stop, focus and selection stay in step.
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1
      : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1
      : 0;
    if (!step && e.key !== 'Home' && e.key !== 'End') return;

    const rows = Array.from(groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
    const from = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (rows.length === 0 || from === -1) return;

    e.preventDefault();
    const to = e.key === 'Home' ? 0
      : e.key === 'End' ? rows.length - 1
      : (from + step + rows.length) % rows.length;
    rows[to].focus();
    if (languageOptions[to] && languageOptions[to].lang !== globalLanguage) {
      onLanguageChange(languageOptions[to].lang);
    }
  };

  return (
    <section>
      <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-widest px-4 mb-2">
        {heading}
      </h3>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={heading}
        onKeyDown={handleKeyDown}
        className={`rounded-xl overflow-hidden shadow-sm border border-border-main transition-all duration-300 ${
          overWallpaper ? 'bg-surface' : 'bg-panel'
        }`}
      >
        {languageOptions.map((opt, idx) => {
          const isSelected = opt.lang === globalLanguage;
          const englishName = ENGLISH_NAMES[opt.lang];
          // Only worth a second line when it says something the label does not.
          const subtitle = englishName && englishName !== opt.label ? englishName : null;

          return (
            <button
              key={opt.lang}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={idx === tabStopIndex ? 0 : -1}
              onClick={() => onLanguageChange(opt.lang)}
              className="w-full min-h-[56px] flex items-stretch gap-3 pl-4 text-left transition-colors hover:bg-border-main/20 active:bg-border-main/40 focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--accent)]"
            >
              <span className="self-center shrink-0 w-7 h-7 rounded-md bg-accent text-accent-on flex items-center justify-center">
                <Languages size={16} aria-hidden="true" />
              </span>
              {/* The hairline lives on the content column so it stops short of
                  the tile, the way an iOS grouped list insets its separators. */}
              <span className={`flex-1 min-w-0 flex items-center gap-3 pr-4 py-1.5 ${
                idx !== languageOptions.length - 1 ? 'border-b border-border-main' : ''
              }`}>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-[17px] leading-tight text-text-main">{opt.label}</span>
                  {subtitle && (
                    <span className="block truncate text-[13px] leading-tight text-text-muted mt-0.5">{subtitle}</span>
                  )}
                </span>
                <Check
                  size={20}
                  strokeWidth={3}
                  aria-hidden="true"
                  className={`shrink-0 text-accent-text transition-all duration-200 ${
                    isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
                  }`}
                />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
