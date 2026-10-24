import React, { useRef, useEffect, useId } from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Languages, Loader2, X, Camera, ClipboardCheck, Square, Volume2, Copy, Check, Share2, ChevronDown, Zap } from 'lucide-react';
import { LANGUAGES, LANGUAGE_FLAGS } from '../constants';
import { Language, AppState, VocabItem } from '../types';
import { VoiceVisualizer } from './common/VoiceVisualizer';
import { useTranslateTab } from '../hooks/useTranslateTab';

type TranslateTabState = ReturnType<typeof useTranslateTab>;

/**
 * Twin of the constant in TranslateTabMobile: the recording indicator has to
 * read as "live" in all four palettes, so it cannot come from an accent token,
 * and Tailwind's `dark:` is a prefers-color-scheme query that would ignore a
 * palette the user chose by hand.
 */
const RECORDING_TEXT =
  'text-red-600 [[data-theme=dark]_&]:text-red-400 [[data-theme=cyberpunk]_&]:text-red-400 [[data-theme=industrial]_&]:text-red-400';

/**
 * Colour and feedback for an icon button. Twin of TranslateTabMobile's, plus a
 * hover fill because this layout is driven by a pointer. Inside an .ios-toolbar
 * the 44px box comes from the stylesheet, so nothing here restates it. No
 * transition-* utility either — it would land in the utilities layer and
 * override .ios-press's transition-transform, leaving the press scale instant.
 * `active` swaps the whole colour utility instead of appending one: two text-*
 * utilities on the same element are resolved by stylesheet order, not by the
 * order they were written in.
 */
const toolbarButton = (active = false) =>
  `ios-press hover:bg-bg-input active:bg-bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text ${
    active ? 'text-accent-text' : 'text-text-muted hover:text-accent-text'
  }`;

interface TranslateTabDesktopProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  vocab: VocabItem[];
  t: (key: string) => string;
  showToast: (message: string, type?: 'info' | 'error' | 'success') => void;
  isListening: boolean;
  interimTranscript: string;
  activeTab: string;
  stopSpeaking: () => void;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isStreaming: boolean;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  handleToggleListening: () => void;
  handleSpeak: (text: string, lang: string) => void;
  handleCopy: (text: string) => Promise<void>;
  isSpeaking: boolean;
  isCopied: boolean;
  loading: boolean;
  transcript: string;
  setTranscript: React.Dispatch<React.SetStateAction<string>>;
  userPreferences?: any;
  /** Lifted into App so the text survives tab and layout changes. */
  translate: TranslateTabState;
}

export function TranslateTabDesktop(props: TranslateTabDesktopProps) {
  const {
    translateInput, setTranslateInput, translateImage, setTranslateImage,
    targetLang, setTargetLang, isSummaryMode, setIsSummaryMode,
    isTranslating, isCached, matchedTerms,
    handleTranslate, handleClearInput,
    handleImageUpload, handlePaste, handlePasteFromClipboard,
    translateInputWithInterim
  } = props.translate;

  const hasBgImage = !!props.userPreferences?.backgroundImage || (props.userPreferences?.backgroundEffect && props.userPreferences.backgroundEffect !== 'none');

  const outputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The switch is a bare button; the row label is its accessible name.
  const summaryLabelId = useId();

  const output = props.state.lastOutputs.translatedText;
  /* `loading` drops on the first streamed chunk while `isTranslating` covers the
     whole run, including the cached replay — so the pair, not either alone, is
     "a translation is in flight". */
  const isBusy = props.loading || isTranslating;

  useEffect(() => {
    if (outputRef.current && (isTranslating || props.isStreaming)) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [props.state.lastOutputs.translatedText, isTranslating, props.isStreaming]);

  const toggleSummaryMode = () => setIsSummaryMode(prev => !prev);

  const handleShare = async () => {
    if (!output) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: props.t('translatedOutput'),
          text: output,
        });
      } catch (e) {
        console.log('Share canceled or failed', e);
      }
    } else {
      props.handleCopy(output);
    }
  };

  return (
    /* Two panes at full height, each scrolling on its own — the split is what a
       wide viewport is for; the grouped-list vocabulary inside it is shared with
       the mobile layout. */
    <div className={`grid grid-cols-2 gap-6 w-full h-[calc(100vh-140px)] min-h-0 overflow-hidden pb-4 p-6 transition-all duration-300 ${
      hasBgImage ? 'bg-transparent' : 'bg-app'
    }`}>
      {/* --- Left: source text, then the options that act on it ------------- */}
      <div className="flex min-h-0 flex-col">
        <h2 className="ios-section-header shrink-0 pt-0">{props.t('inputSource')}</h2>

        {/* Only this group flexes; everything below keeps its content height, so
            a short window shrinks the typing area rather than the controls.
            .ios-inset-group is already bg-surface, the token meant for a panel
            over a wallpaper — the blur is the only part still conditional. */}
        <div className={`ios-inset-group flex min-h-0 flex-1 flex-col ${hasBgImage ? 'backdrop-blur-md' : ''}`}>
          <textarea
            value={translateInputWithInterim}
            onChange={(e) => {
              setTranslateInput(e.target.value);
            }}
            onKeyDown={(e) => {
              // isComposing: Telex and Pinyin commit a candidate with Enter, so
              // without this the keystroke that finishes a Vietnamese or Chinese
              // word is swallowed and translates a half-typed input instead.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleTranslate();
              }
            }}
            onPaste={handlePaste}
            placeholder={props.t('inputPlaceholder')}
            className="ios-separator custom-scrollbar min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent px-4 py-3 text-base leading-relaxed text-text-main placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-text"
          />

          {/* A row in the flow, not a floating thumbnail: the old wrapper carried
              `absolute` and `relative` at once, so which one applied came down to
              the order Tailwind happened to emit them in. */}
          {translateImage && (
            <div className="ios-row ios-separator shrink-0">
              {/* Decorative: the label beside it already names the attachment. */}
              <img
                src={translateImage}
                alt=""
                aria-hidden="true"
                className="h-12 w-12 shrink-0 rounded-lg border border-border-main object-cover"
              />
              <span className="min-w-0 flex-1 truncate">{props.t('imageAttached')}</span>
              {/* Was hover-only, which left no hint the attachment could go. */}
              <button
                type="button"
                onClick={() => setTranslateImage(null)}
                aria-label={props.t('removeImage')}
                title={props.t('removeImage')}
                className={`${toolbarButton()} -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full`}
              >
                <X size={20} />
              </button>
            </div>
          )}

          {matchedTerms.length > 0 && (
            <div className="ios-separator shrink-0 px-4 py-2.5">
              <p className="text-[13px] text-ios-label-secondary">{props.t('detectedTerms')}</p>
              {/* Wraps rather than scrolling sideways — there is width for it
                  here — but stays capped so a long match list cannot eat the
                  typing area. */}
              <div className="custom-scrollbar mt-1.5 flex max-h-[4.75rem] flex-wrap gap-1.5 overflow-y-auto">
                {matchedTerms.map(match => (
                  <span
                    /* One row can match twice (its VI and EN phrases both present), so the span pins the key. */
                    key={`${match.item.id}-${match.start}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ios-fill px-2.5 py-1 text-[13px]"
                  >
                    {/* The phrase that actually matched, not item.term — that is a category label. */}
                    <span className="font-semibold text-accent-text">{match.source}</span>
                    <span aria-hidden="true" className="text-ios-label-secondary">&rarr;</span>
                    <span className="font-medium text-text-main">{match.target}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* The interim transcript lands in the textarea itself, so the state
              needs saying somewhere that is not on top of the text being typed. */}
          {props.isListening && (
            <div className={`ios-row ios-separator shrink-0 gap-2 text-[13px] font-semibold uppercase tracking-widest ${RECORDING_TEXT}`}>
              <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-current" />
              <span>{props.t('listening')}</span>
            </div>
          )}

          <div className="ios-toolbar shrink-0">
            <button
              type="button"
              onClick={handleClearInput}
              aria-label={props.t('clearInput')}
              title={props.t('clearInput')}
              className={toolbarButton()}
            >
              <X size={20} />
            </button>
            {/* Cleared on open, or picking the same file again after removing it
                fires no change event and silently does nothing. */}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onClick={e => { (e.target as HTMLInputElement).value = ''; }}
              onChange={handleImageUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label={props.t('uploadImage')}
              title={props.t('uploadImage')}
              className={toolbarButton()}
            >
              <Camera size={20} />
            </button>
            {/* One mic, not a plain button plus a visualizer that appeared beside
                it the moment recording started. */}
            <VoiceVisualizer
              isListening={props.isListening}
              onClick={props.handleToggleListening}
              title={props.isListening ? props.t('listeningActive') : props.t('startVoice')}
            />
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              aria-label={props.t('paste')}
              title={props.t('paste')}
              className={toolbarButton()}
            >
              <ClipboardCheck size={20} />
            </button>
          </div>
        </div>

        {/* Enter-to-translate is the fastest path on a keyboard and was entirely
            undiscoverable before. */}
        <p className="ios-section-footer shrink-0">{props.t('enterToTranslateHint')}</p>

        {/* --- Options ----------------------------------------------------- */}
        <h3 className="ios-section-header shrink-0">{props.t('translationOptions')}</h3>

        <div className={`ios-inset-group shrink-0 ${hasBgImage ? 'backdrop-blur-md' : ''}`}>
          {/* A native <select> stretched transparently over a presentation layer,
              so the platform's own menu opens. The visual layer takes no pointer
              events, and the select covers the whole row, so the label is part of
              the target too. The ring is keyed off the select's own
              focus-visible because an opacity-0 control cannot show one itself. */}
          <div className="ios-row ios-separator relative has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-inset has-[select:focus-visible]:ring-accent-text">
            {/* aria-hidden: the select below is named with these same words, and
                without this the row announces "Target Language" twice. */}
            <span aria-hidden="true" className="min-w-0 flex-1 truncate">{props.t('targetLanguage')}</span>
            <span aria-hidden="true" className="pointer-events-none flex max-w-[60%] shrink-0 items-center gap-1 text-ios-label-secondary">
              <span className="truncate">{LANGUAGE_FLAGS[targetLang]} {targetLang}</span>
              <ChevronDown size={18} className="shrink-0" />
            </span>
            <select
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={targetLang}
              onChange={e => setTargetLang(e.target.value as Language)}
              aria-label={props.t('targetLanguage')}
            >
              {LANGUAGES.map(l => <option key={l} value={l} className="bg-panel text-text-main">{LANGUAGE_FLAGS[l]} {l}</option>)}
            </select>
          </div>

          {/* The switch is the only focusable control, as on iOS; the row keeps a
              pointer handler because the label was clickable before this.
              stopPropagation on the switch keeps a click on it from toggling
              twice. */}
          <div className="ios-row cursor-pointer" onClick={toggleSummaryMode}>
            <span id={summaryLabelId} className="min-w-0 flex-1 truncate">{props.t('summaryMode')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={isSummaryMode}
              aria-labelledby={summaryLabelId}
              onClick={e => { e.stopPropagation(); toggleSummaryMode(); }}
              className="ios-switch"
            />
          </div>
        </div>

        <p className="ios-section-footer shrink-0">{props.t('summaryModeHint')}</p>

        <button
          onClick={() => handleTranslate()}
          disabled={props.loading || isTranslating || props.isStreaming || (!translateInput.trim() && !translateImage)}
          className="saas-button primary-button mt-4 w-full shrink-0 shadow-lg shadow-accent/20"
        >
          {isBusy ? <Loader2 className="animate-spin" size={20} /> : <Languages size={20} />}
          <span>{props.t('translate')}</span>
        </button>
      </div>

      {/* --- Right: output ------------------------------------------------- */}
      <div className="flex min-h-0 flex-col">
        <div className="ios-section-header flex shrink-0 items-center gap-2 pt-0">
          <h2 className="min-w-0 truncate">{props.t('translatedOutput')}</h2>
          {isBusy && (
            <span className="inline-flex shrink-0 animate-pulse items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-accent-text">
              <Loader2 size={10} className="animate-spin" aria-hidden="true" />
              {props.t('translating')}
            </span>
          )}
        </div>

        <div className={`ios-inset-group flex min-h-0 flex-1 flex-col ${hasBgImage ? 'backdrop-blur-md' : ''}`}>
          {/* The scroll region the streaming effect pins to the bottom. pre-wrap
              is load-bearing: the model streams single newlines that Markdown
              would otherwise fold into one paragraph. */}
          <div
            ref={outputRef}
            className="ios-separator custom-scrollbar min-h-0 w-full flex-1 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-base leading-relaxed text-text-main"
          >
            {output ? (
              <div className="markdown-body">
                <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {output}
                </Markdown>
              </div>
            ) : isBusy ? (
              /* Only until the first chunk lands — after that the text itself is
                 the progress, which is what the auto-scroll is there for. */
              <div className="flex h-full flex-col items-center justify-center gap-4 text-text-muted">
                <Loader2 size={32} className="animate-spin text-accent-text" />
                <p className="animate-pulse font-medium">{props.t('translating')}</p>
              </div>
            ) : (
              <span className="italic text-text-muted">{props.t('translationPlaceholder')}</span>
            )}
          </div>

          {output && !isBusy && (
            <div className="ios-toolbar shrink-0 justify-end">
              <button
                type="button"
                onClick={() => props.handleSpeak(output, targetLang)}
                aria-label={props.isSpeaking ? props.t('stopSpeaking') : props.t('speakText')}
                title={props.isSpeaking ? props.t('stopSpeaking') : props.t('speakText')}
                className={toolbarButton(props.isSpeaking)}
              >
                {props.isSpeaking ? <Square size={20} /> : <Volume2 size={20} />}
              </button>
              <button
                type="button"
                onClick={() => props.handleCopy(output)}
                aria-label={props.t('copy')}
                title={props.t('copy')}
                className={toolbarButton(props.isCopied)}
              >
                {props.isCopied ? <Check size={20} /> : <Copy size={20} />}
              </button>
              <button
                type="button"
                onClick={handleShare}
                aria-label={props.t('share')}
                title={props.t('share')}
                className={toolbarButton()}
              >
                <Share2 size={20} />
              </button>
            </div>
          )}
        </div>

        {output && isCached && !isBusy && (
          <p className="ios-section-footer flex shrink-0 items-center gap-1.5">
            <Zap size={13} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 truncate">{props.t('instantTranslation')}</span>
          </p>
        )}
      </div>
    </div>
  );
}
