import React, { useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Check, ChevronRight, Image as ImageIcon, ImagePlus, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { UserPreferences } from '../../types';
import { MAX_SAVED_WALLPAPERS } from '../../utils/imageResize';
import { DEFAULT_WALLPAPERS, WallpaperOption } from '../../constants/wallpapers';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

/** Longest a wallpaper name may be, matching what the old prompt() accepted. */
const MAX_NAME_LENGTH = 40;

/**
 * The built-in "no wallpaper" swatch, spread ahead of DEFAULT_WALLPAPERS. Its
 * empty id is the stored value for "default". `style` is vestigial — every
 * render site draws an <img> and never reads the gradient.
 */
const DEFAULT_SWATCH: WallpaperOption = {
  id: '',
  name: 'Default',
  key: 'personalization.bg.default',
  style: ''
};

interface WallpaperSectionProps {
  userPreferences: UserPreferences;
  onUserPreferencesChange: (prefs: UserPreferences) => void;
  /**
   * From useSettingsPanel. Downscales the files to fit localStorage, dedupes,
   * caps the gallery at MAX_SAVED_WALLPAPERS, selects the last image added and
   * returns a notice when something could not be added.
   */
  addWallpaperFiles: (
    files: FileList | File[],
    prefs: UserPreferences,
    onChange: (p: UserPreferences) => void
  ) => Promise<string | null>;
  t: (key: string) => string;
}

/** One frame in the preview strip: a preset, or an image the user saved. */
interface Tile {
  url: string;
  label: string;
}

/**
 * Roving arrow-key movement inside a radiogroup, clamped at both ends rather
 * than wrapping. Selection follows focus here and settings auto-save on every
 * change, so a wrapping list would cycle the whole strip — and write storage
 * once per repeat — for as long as the key is held.
 */
function moveRadio(
  e: React.KeyboardEvent,
  index: number,
  count: number,
  select: (next: number) => void,
  refs: React.MutableRefObject<(HTMLButtonElement | null)[]>
) {
  let next = index;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(index + 1, count - 1);
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(index - 1, 0);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = count - 1;
  else return;

  e.preventDefault();
  if (next === index) return;
  select(next);
  // preventScroll because the strip scrolls itself below; the browser's own
  // focus scroll would drag the whole settings sheet along with it.
  refs.current[next]?.focus({ preventScroll: true });
}

/** Stand-in preview for "no wallpaper" — the app's own chrome, in miniature. */
const DefaultPreview: React.FC = () => (
  <>
    <span className="absolute inset-0 bg-gradient-to-b from-panel to-app" />
    <span className="absolute inset-x-5 top-3 h-1.5 rounded-full bg-text-muted/30" />
    <span className="absolute inset-x-3 top-8 bottom-6 rounded-2xl border border-border-main bg-panel/70" />
  </>
);

/**
 * iOS-style wallpaper picker: a horizontally scrolling strip of device-shaped
 * previews for the presets and the user's saved images, over an inset group of
 * action rows. Rendered by both settings panels.
 */
export const WallpaperSection: React.FC<WallpaperSectionProps> = ({
  userPreferences,
  onUserPreferencesChange,
  addWallpaperFiles,
  t
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : SPRING;
  const headingId = useId();
  const footerId = useId();

  // Preferences come back from localStorage unvalidated, so never assume the list.
  const saved = userPreferences.savedWallpapers || [];
  const current = userPreferences.backgroundImage || '';

  const tiles: Tile[] = [
    // Proper nouns ("Lofi", "Samba OG") must not go through i18n; only the
    // built-in Default swatch carries a key. opt.id IS the image URL.
    ...[DEFAULT_SWATCH, ...DEFAULT_WALLPAPERS].map<Tile>((opt) => ({
      url: opt.id,
      label: opt.key ? t(opt.key) : opt.name
    })),
    ...saved.map<Tile>((wp) => ({ url: wp.url, label: wp.name }))
  ];

  const checkedIndex = tiles.findIndex((tile) => tile.url === current);
  // A stored wallpaper that no longer exists leaves nothing checked; park the
  // group's single tab stop on the first frame so it stays keyboard-reachable.
  const tabStopIndex = checkedIndex === -1 ? 0 : checkedIndex;
  /** Set only when the wallpaper in use is one the user added — those can be edited. */
  const selectedSaved = current ? saved.find((wp) => wp.url === current) : undefined;

  // Bring the active frame into view: on open it may sit past the right edge,
  // and an upload auto-selects the image it just appended to the far end.
  // scrollLeft rather than scrollIntoView, which would also scroll the sheet.
  useEffect(() => {
    const el = tileRefs.current[checkedIndex];
    const strip = stripRef.current;
    if (!el || !strip) return;
    const tile = el.getBoundingClientRect();
    const box = strip.getBoundingClientRect();
    strip.scrollLeft += tile.left - box.left - (box.width - tile.width) / 2;
  }, [checkedIndex]);

  // Picking a different wallpaper closes the editor; it always acts on the
  // selected one, so leaving it open would retarget it silently.
  useEffect(() => {
    setEditorOpen(false);
  }, [current]);

  useEffect(() => {
    if (editorOpen) nameRef.current?.focus({ preventScroll: true });
  }, [editorOpen]);

  const selectTile = (url: string) => {
    onUserPreferencesChange({ ...userPreferences, backgroundImage: url });
  };

  const toggleEditor = () => {
    if (!selectedSaved) return;
    if (editorOpen) {
      setEditorOpen(false);
      return;
    }
    setNameDraft(selectedSaved.name);
    setEditorOpen(true);
  };

  const commitRename = () => {
    const name = nameDraft.trim().slice(0, MAX_NAME_LENGTH);
    if (!selectedSaved || !name) return;
    onUserPreferencesChange({
      ...userPreferences,
      savedWallpapers: saved.map((wp) => (wp.url === selectedSaved.url ? { ...wp, name } : wp))
    });
    setEditorOpen(false);
    setNotice(null);
  };

  const removeSelected = () => {
    if (!selectedSaved) return;
    onUserPreferencesChange({
      ...userPreferences,
      savedWallpapers: saved.filter((wp) => wp.url !== selectedSaved.url),
      // The image in use is going away, so fall back to the default background.
      backgroundImage: ''
    });
    setEditorOpen(false);
    setNotice(null);
  };

  const saveFromLink = () => {
    const url = urlDraft.trim();
    if (!url) return;
    // Presets count as already-present: saving one would put two frames with
    // the same URL in the strip, only one of which could ever read as checked.
    const known = [...DEFAULT_WALLPAPERS.map((opt) => opt.id), ...saved.map((wp) => wp.url)];
    if (known.includes(url)) {
      setNotice(t('personalization.duplicate_wallpaper'));
      return;
    }
    if (saved.length >= MAX_SAVED_WALLPAPERS) {
      // t() has no interpolation, so the cap is substituted into the message.
      setNotice(t('personalization.limit_reached').replace('{max}', String(MAX_SAVED_WALLPAPERS)));
      return;
    }
    onUserPreferencesChange({
      ...userPreferences,
      savedWallpapers: [...saved, { url, name: `${t('personalization.wallpaper_default_name')} ${saved.length + 1}` }],
      backgroundImage: url
    });
    setUrlDraft('');
    setNotice(null);
  };

  const heading = t('personalization.background');
  const rowBase =
    'w-full min-h-[52px] flex items-center gap-3 px-4 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent';
  const groupClass = 'rounded-xl border border-border-main bg-surface overflow-hidden';
  const tileClass = 'shrink-0 w-8 h-8 rounded-lg bg-accent text-accent-on flex items-center justify-center';
  // Inset to where the label starts (px-4 + 32px tile + gap-3), as iOS does.
  const hairline = <div aria-hidden="true" className="h-px bg-border-main ml-[60px]" />;

  return (
    <section className="space-y-3">
      <h3
        id={headingId}
        className="text-[11px] font-medium text-text-muted uppercase tracking-widest flex items-center gap-2"
      >
        <ImageIcon size={13} aria-hidden="true" />
        {heading}
      </h3>

      {/* data-no-swipe opts the strip out of the swipe-to-change-tab gesture on
          the page container, which otherwise claims horizontal drags. */}
      <div
        ref={stripRef}
        data-no-swipe
        role="radiogroup"
        aria-labelledby={headingId}
        aria-describedby={footerId}
        className="no-scrollbar flex gap-3 overflow-x-auto overscroll-x-contain snap-x pb-1"
      >
        {tiles.map((tile, i) => {
          const selected = i === checkedIndex;
          return (
            <motion.button
              // Composed key: stored data may already pair a saved image with a
              // preset URL, and the index alone would not survive a delete.
              key={`${i < tiles.length - saved.length ? 'preset' : 'saved'}:${tile.url}`}
              ref={(el) => {
                tileRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={i === tabStopIndex ? 0 : -1}
              onClick={() => selectTile(tile.url)}
              onKeyDown={(e) => moveRadio(e, i, tiles.length, (n) => selectTile(tiles[n].url), tileRefs)}
              whileTap={{ scale: 0.97 }}
              transition={transition}
              className="group shrink-0 w-[96px] snap-start focus:outline-none"
            >
              <span
                className={`relative block h-[204px] rounded-[26px] overflow-hidden border-2 transition-colors group-focus-visible:ring-2 group-focus-visible:ring-inset group-focus-visible:ring-accent ${
                  selected ? 'border-accent' : 'border-border-main'
                }`}
              >
                {tile.url ? (
                  <img
                    src={tile.url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <DefaultPreview />
                )}
                <AnimatePresence initial={false}>
                  {selected && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={transition}
                      title={t('personalization.active_badge')}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-accent text-accent-on flex items-center justify-center shadow-sm"
                    >
                      <Check size={14} strokeWidth={3} aria-hidden="true" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span
                className={`mt-1.5 block w-full truncate text-center text-[12px] leading-tight ${
                  selected ? 'text-accent-text font-semibold' : 'text-text-muted'
                }`}
              >
                {tile.label}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Rename and delete for the image in use, replacing the old window.prompt.
          Kept out of the strip so the radiogroup owns nothing but its radios. */}
      <AnimatePresence initial={false}>
        {selectedSaved && (
          <motion.div
            key="wallpaper-edit"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={transition}
            className="overflow-hidden"
          >
            <div className={groupClass}>
              <button
                type="button"
                onClick={toggleEditor}
                aria-expanded={editorOpen}
                aria-label={`${t('personalization.edit_wallpaper')} — ${selectedSaved.name}`}
                className={`${rowBase} hover:bg-bg-input`}
              >
                <span className={tileClass}>
                  <Pencil size={16} aria-hidden="true" />
                </span>
                <span className="flex-1 min-w-0 truncate text-[17px] text-text-main">
                  {t('personalization.edit_wallpaper')}
                </span>
                <ChevronRight
                  size={18}
                  aria-hidden="true"
                  className={`shrink-0 text-text-muted transition-transform duration-200 ${editorOpen ? 'rotate-90' : ''}`}
                />
              </button>

              <AnimatePresence initial={false}>
                {editorOpen && (
                  <motion.div
                    key="wallpaper-editor-body"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={transition}
                    className="overflow-hidden"
                  >
                    {hairline}
                    <div className="min-h-[52px] flex items-center gap-3 px-4 py-2">
                      <input
                        ref={nameRef}
                        type="text"
                        value={nameDraft}
                        maxLength={MAX_NAME_LENGTH}
                        aria-label={t('personalization.rename_wallpaper')}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setEditorOpen(false);
                        }}
                        className="flex-1 min-w-0 h-11 px-3 rounded-lg bg-bg-input border border-border-strong text-[15px] text-text-main placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      />
                      <button
                        type="button"
                        onClick={commitRename}
                        disabled={!nameDraft.trim()}
                        className="shrink-0 h-11 px-4 rounded-lg bg-accent text-accent-on text-[15px] font-medium transition-opacity disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {t('personalization.done')}
                      </button>
                    </div>
                    {hairline}
                    {/* No danger token exists; text-red-500 is what the panels'
                        other destructive rows already use. The tile is tinted
                        rather than filled — white on a red fill fails AA on two
                        of the four palettes. */}
                    <button type="button" onClick={removeSelected} className={`${rowBase} text-red-500 hover:bg-bg-input`}>
                      <span className="shrink-0 w-8 h-8 rounded-lg bg-red-500/15 text-red-500 flex items-center justify-center">
                        <Trash2 size={16} aria-hidden="true" />
                      </span>
                      <span className="flex-1 min-w-0 truncate text-[17px]">{t('personalization.remove_wallpaper')}</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action rows — bg-surface is already theme- and wallpaper-correct, so
          no hasBgImage branch is needed here. */}
      <div className={groupClass}>
        <div className="min-h-[52px] flex items-center gap-3 px-4 py-2">
          <span className={tileClass}>
            <Link2 size={16} aria-hidden="true" />
          </span>
          <input
            type="text"
            value={urlDraft}
            placeholder={t('personalization.custom_bg_placeholder')}
            aria-label={t('personalization.add_from_link')}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveFromLink();
            }}
            className="flex-1 min-w-0 h-11 px-3 rounded-lg bg-bg-input border border-border-strong text-[15px] text-text-main placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <button
            type="button"
            onClick={saveFromLink}
            disabled={!urlDraft.trim()}
            aria-label={t('personalization.save_wallpaper')}
            title={t('personalization.save_wallpaper')}
            className="shrink-0 w-11 h-11 rounded-lg bg-accent text-accent-on flex items-center justify-center transition-opacity disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus size={20} aria-hidden="true" />
          </button>
        </div>

        {hairline}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = e.target.files;
            if (!files?.length) return;
            setNotice(t('personalization.processing'));
            const msg = await addWallpaperFiles(files, userPreferences, onUserPreferencesChange);
            setNotice(msg);
            e.target.value = '';
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className={`${rowBase} hover:bg-bg-input`}>
          <span className={tileClass}>
            <ImagePlus size={16} aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0 truncate text-[17px] text-text-main">
            {t('personalization.upload_wallpapers')}
          </span>
          <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-text-muted" />
        </button>

        {hairline}

        <div className="min-h-[52px] flex items-center gap-3 px-4 py-2">
          <span className={tileClass}>
            <ImageIcon size={16} aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0 truncate text-[17px] text-text-main">
            {t('personalization.saved_wallpapers')}
          </span>
          <span className="shrink-0 text-[15px] tabular-nums text-text-muted">
            {saved.length}/{MAX_SAVED_WALLPAPERS}
          </span>
        </div>
      </div>

      <p id={footerId} aria-live="polite" className="text-[13px] leading-snug text-text-muted">
        {notice ?? t('personalization.wallpaper_hint')}
      </p>
    </section>
  );
};
