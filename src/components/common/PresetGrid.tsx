import React, { useEffect, useRef } from 'react';
import { Check, ChevronDown, FileText, FileSearch, Clock, HelpCircle, Megaphone, Settings2 } from 'lucide-react';
import {
  CORE_PRESETS,
  AUDIENCES,
  TONES,
  LENGTHS,
  FORMATS,
  LANGUAGES,
  LANGUAGE_FLAGS,
  ComposePreset,
  presetById,
} from '../../constants';
import { Audience, Tone, Length, Format, Language } from '../../types';
import { safeLocalStorage } from '../../utils/safeStorage';

const ICON_MAP: Record<string, React.ElementType> = {
  FileText,
  FileSearch,
  Clock,
  HelpCircle,
  Megaphone,
  Settings2,
};

/** Unchanged from the long-press modal that used to write it: a combination
 *  saved by an earlier build must still come back after this rebuild. */
const STORAGE_KEY = 'sra_custom_preset';

/** The five values the compose prompt is built from. */
interface ComposeParams {
  audience: Audience;
  tone: Tone;
  length: Length;
  format: Format;
  lang: Language;
}

/** Just the four a preset owns — `lang` is deliberately not one of them, see
 *  the note on `setParam`. Matches ComposePreset['settings'] exactly. */
type PresetSettings = ComposePreset['settings'];

/** An option list as constants.ts declares it: a wire value plus an i18n key. */
type LabelledOption = { value: string; labelKey: string };

/**
 * The values a stored entry is allowed to carry.
 *
 * Anything else reaches /api/compose as an unknown token, where it falls
 * through to the generic branch — so a stale key from an older build, or a
 * hand-edited storage entry, would quietly cost the user the register they
 * picked AND leave that row's <select> matching no option, which renders as a
 * blank value. Validating on the way in is cheaper than explaining either.
 */
const ALLOWED_VALUES: Record<keyof ComposeParams, readonly string[]> = {
  audience: AUDIENCES.map(o => o.value),
  tone: TONES.map(o => o.value),
  length: LENGTHS.map(o => o.value),
  format: FORMATS.map(o => o.value),
  // Composing needs a definite output language; 'Auto' is a translate-side idea.
  lang: LANGUAGES.filter(l => l !== 'Auto'),
};

/** The saved custom combination, with every unrecognised field dropped. */
function readSavedCustom(): Partial<ComposeParams> | null {
  const raw = safeLocalStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean: Record<string, string> = {};
    for (const key of Object.keys(ALLOWED_VALUES) as (keyof ComposeParams)[]) {
      const value = parsed[key];
      if (typeof value === 'string' && ALLOWED_VALUES[key].includes(value)) clean[key] = value;
    }
    return Object.keys(clean).length > 0 ? (clean as Partial<ComposeParams>) : null;
  } catch {
    // No console.error: this runs on every mount, and a single malformed entry
    // would then report an error for the rest of the session. Falling back to
    // the parameters already on screen is a fine place to land.
    return null;
  }
}

const settingsOf = (params: ComposeParams): PresetSettings => ({
  audience: params.audience,
  tone: params.tone,
  length: params.length,
  format: params.format,
});

const optionLabel = (options: readonly LabelledOption[], value: string, t: (key: string) => string) => {
  const found = options.find(o => o.value === value);
  return found ? t(found.labelKey) : '';
};

/**
 * One grouped-list row that is really a native <select> stretched
 * transparently over a presentation layer.
 *
 * On iOS that is what summons the real wheel picker, which no custom menu
 * imitates, and covering the whole row means the label is part of the target
 * too. The visual layer takes no pointer events so the tap always reaches the
 * select, and the ring is keyed off the select's own focus-visible because an
 * opacity-0 control cannot show one itself. Same construction, and the same
 * reasons, as the Target Language row in TranslateTabMobile.
 */
const SelectRow: React.FC<{
  label: string;
  value: string;
  display: React.ReactNode;
  onChange: (value: string) => void;
  children: React.ReactNode;
}> = ({ label, value, display, onChange, children }) => (
  <div className="ios-row ios-separator relative has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-inset has-[select:focus-visible]:ring-accent-text">
    {/* aria-hidden: the select below is named with these same words, and
        without this every row announces its label twice. */}
    <span aria-hidden="true" className="min-w-0 flex-1 truncate">{label}</span>
    {/* Capped so a long value ("Subordinates / Line Workers") cannot push the
        label off a 320px screen; both sides truncate rather than wrap. */}
    <span
      aria-hidden="true"
      className="pointer-events-none flex max-w-[55%] shrink-0 items-center gap-1 text-ios-label-secondary"
    >
      <span className="truncate">{display}</span>
      <ChevronDown size={18} className="shrink-0" />
    </span>
    <select
      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      value={value}
      onChange={e => onChange(e.target.value)}
      aria-label={label}
    >
      {children}
    </select>
  </div>
);

interface PresetGridProps {
  activePresetId: string;
  onSelectPreset: (preset: ComposePreset) => void;
  customParams: ComposeParams;
  onUpdateCustomParams: (params: Partial<ComposeParams>) => void;
  t: (key: string) => string;
}

export const PresetGrid: React.FC<PresetGridProps> = ({
  activePresetId,
  onSelectPreset,
  customParams,
  onUpdateCustomParams,
  t,
}) => {
  /**
   * Restore the saved combination once, on mount.
   *
   * The guard is the point: the parent hands down a fresh
   * `onUpdateCustomParams` arrow on every render, so a dependency-complete
   * effect would re-run constantly and keep re-applying the stored values over
   * whatever the user had just picked. It also absorbs StrictMode's double
   * invoke in development.
   *
   * Only when the active choice is still Custom — a named preset has already
   * decided all four values, and the saved combination must not overrule it.
   */
  const hasRestored = useRef(false);
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;
    if (activePresetId !== 'custom') return;
    const saved = readSavedCustom();
    if (saved) onUpdateCustomParams(saved);
  }, [activePresetId, onUpdateCustomParams]);

  /**
   * Editing a parameter means the answer is no longer a named preset. That is
   * the existing contract; what changed is how Custom is reached.
   *
   * It goes through `onSelectPreset` so the parent stays the single owner of
   * both the id and the parameters — but with the EDITED settings in place of
   * the Custom entry's placeholder defaults. Handing over the stock entry is
   * what the old Save button did, and since the parent's handler applies
   * `preset.settings`, the four values the user had just chosen were
   * immediately overwritten with cross_dept/professional/standard/wechat_zalo.
   * Harmless while every preset shared one default; now that each token drives
   * a distinct register, budget and document shape, it discarded the whole
   * choice silently.
   */
  const setParam = <K extends keyof ComposeParams>(key: K, value: ComposeParams[K]) => {
    const next: ComposeParams = { ...customParams, [key]: value };
    safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(next));

    if (key === 'lang') {
      // A preset does not carry a language, so choosing one contradicts
      // nothing: switching to Custom here would throw away "Urgent Report"
      // because the user wants it written in Vietnamese.
      onUpdateCustomParams({ lang: value as Language });
      return;
    }
    onSelectPreset({ ...presetById('custom'), settings: settingsOf(next) });
  };

  const handlePick = (preset: ComposePreset) => {
    if (preset.id !== 'custom') {
      onSelectPreset(preset);
      return;
    }
    // Tapping Custom returns to the user's own combination — the saved one if
    // there is one, otherwise the values already on screen. Passing the entry
    // through untouched would apply its placeholder defaults and discard the
    // very combination the row is named for. Its `lang` is not reapplied: the
    // language is a standing preference, restored on mount and otherwise left
    // exactly where the user put it.
    const next: ComposeParams = { ...customParams, ...readSavedCustom() };
    onSelectPreset({ ...preset, settings: settingsOf(next) });
  };

  return (
    <div>
      {/* --- Purpose -------------------------------------------------------
          A grouped list, not a six-way segmented control: six icons at 390px
          gave each preset ~55px and no room for a name, so the only clue to
          what any of them produced was a title attribute a thumb cannot
          reach. One row per preset shows the name and its "what you get"
          line, and the chosen one carries a checkmark. */}
      <h3 className="ios-section-header">{t('composePurpose')}</h3>

      <div className="ios-inset-group">
        {CORE_PRESETS.map(preset => {
          const isActive = activePresetId === preset.id;
          const IconComponent = ICON_MAP[preset.iconName] || FileText;

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePick(preset)}
              /* aria-pressed rather than role="radio": a radiogroup owes its
                 members arrow-key navigation and a roving tabindex, and a
                 six-row list where every row is Tab-reachable serves a
                 keyboard better than one stop that needs arrows to explore.
                 No transition-* utility either — it would land in the
                 utilities layer and override .ios-press's transition-transform,
                 leaving the tap-down scale instant. */
              aria-pressed={isActive}
              className="ios-row ios-separator ios-press items-start active:bg-ios-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-text"
            >
              <IconComponent
                size={20}
                strokeWidth={isActive ? 2.25 : 1.75}
                aria-hidden="true"
                /* The state swaps the whole colour utility instead of
                   appending a second one: two text-* utilities on one element
                   are resolved by stylesheet order, not authoring order. */
                className={`mt-0.5 shrink-0 ${isActive ? 'text-accent-text' : 'text-ios-label-secondary'}`}
              />

              <span className="min-w-0 flex-1">
                <span className={`block truncate ${isActive ? 'font-semibold text-accent-text' : 'font-normal'}`}>
                  {t(preset.nameKey)}
                </span>
                {/* The hint is the whole reason a name alone was not enough:
                    "Explanation" does not say that it writes a formal email
                    with a root cause and a countermeasure in it. */}
                <span className="mt-0.5 block text-[13px] font-normal leading-snug text-ios-label-secondary">
                  {t(preset.hintKey)}
                </span>
              </span>

              {/* iOS marks the chosen row with a checkmark. Without it the
                  accent tint would be the only signal, and colour alone is
                  not one (WCAG 1.4.1). */}
              {isActive && <Check size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-text" />}
            </button>
          );
        })}
      </div>

      {/* --- Parameters ----------------------------------------------------
          Real rows, in place of the single muted "audience • tone • length"
          line that showed three of the five values and let none of them be
          changed without discovering a long-press on the Custom button. With
          every parameter visible and editable, that gesture — undiscoverable,
          and with no keyboard equivalent — has nothing left to open, so both
          it and its modal are gone. */}
      <h3 className="ios-section-header">{t('composeOptions')}</h3>

      <div className="ios-inset-group">
        <SelectRow
          label={t('audience')}
          value={customParams.audience}
          display={optionLabel(AUDIENCES, customParams.audience, t)}
          onChange={value => setParam('audience', value as Audience)}
        >
          {AUDIENCES.map(o => (
            <option key={o.value} value={o.value} className="bg-panel text-text-main">{t(o.labelKey)}</option>
          ))}
        </SelectRow>

        <SelectRow
          label={t('tone')}
          value={customParams.tone}
          display={optionLabel(TONES, customParams.tone, t)}
          onChange={value => setParam('tone', value as Tone)}
        >
          {TONES.map(o => (
            <option key={o.value} value={o.value} className="bg-panel text-text-main">{t(o.labelKey)}</option>
          ))}
        </SelectRow>

        <SelectRow
          label={t('length')}
          value={customParams.length}
          display={optionLabel(LENGTHS, customParams.length, t)}
          onChange={value => setParam('length', value as Length)}
        >
          {LENGTHS.map(o => (
            <option key={o.value} value={o.value} className="bg-panel text-text-main">{t(o.labelKey)}</option>
          ))}
        </SelectRow>

        <SelectRow
          label={t('format')}
          value={customParams.format}
          display={optionLabel(FORMATS, customParams.format, t)}
          onChange={value => setParam('format', value as Format)}
        >
          {FORMATS.map(o => (
            <option key={o.value} value={o.value} className="bg-panel text-text-main">{t(o.labelKey)}</option>
          ))}
        </SelectRow>

        <SelectRow
          label={t('language')}
          value={customParams.lang}
          display={`${LANGUAGE_FLAGS[customParams.lang] ?? ''} ${customParams.lang}`}
          onChange={value => setParam('lang', value as Language)}
        >
          {ALLOWED_VALUES.lang.map(l => (
            <option key={l} value={l} className="bg-panel text-text-main">{LANGUAGE_FLAGS[l]} {l}</option>
          ))}
        </SelectRow>
      </div>

      {/* Says out loud what the two groups do to each other, which nothing in
          the old strip did: the preset wrote the parameters, editing one wrote
          back "Custom", and neither direction was visible. */}
      <p className="ios-section-footer">{t('composeOptionsHint')}</p>
    </div>
  );
};
