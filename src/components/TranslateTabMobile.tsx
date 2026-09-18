import React, { useRef, useEffect, useId } from 'react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Languages, Loader2, X, Camera, ClipboardCheck, Square, Volume2, Copy, Check, Share2, ChevronDown, Zap } from 'lucide-react';
import { LANGUAGES, LANGUAGE_FLAGS } from '../constants';
import { Language, AppState, VocabItem, ConversationContext } from '../types';
import { VoiceVisualizer } from './common/VoiceVisualizer';
import { useTranslateTab } from '../hooks/useTranslateTab';

type TranslateTabState = ReturnType<typeof useTranslateTab>;

/** Mirrors the textarea's maxLength; the footer counter reads the same number. */
const MAX_INPUT = 1500;

/**
 * The recording indicator has to read as "live" in all four palettes, so it
 * cannot come from an accent token. Same value and the same data-theme keying
 * as SystemSection's DANGER_TEXT — Tailwind's `dark:` is a prefers-color-scheme
 * query and would ignore a palette the user chose by hand.
 */
const RECORDING_TEXT =
  'text-red-600 [[data-theme=dark]_&]:text-red-400 [[data-theme=cyberpunk]_&]:text-red-400 [[data-theme=industrial]_&]:text-red-400';

/**
 * Colour and feedback for an icon button. Inside an .ios-toolbar the 44px box
 * comes from the stylesheet, so nothing here restates it; elsewhere the call
 * site adds it. No transition-* utility appears either — it would land in the
 * utilities layer and override .ios-press's transition-transform, leaving the
 * tap-down scale instant. `active` swaps the whole colour utility instead of
 * appending one: two text-* utilities on the same element are resolved by
 * stylesheet order, not by the order they were written in.
 */
const toolbarButton = (active = false) =>
  `ios-press active:bg-bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text ${
    active ? 'text-accent-text' : 'text-text-muted hover:text-accent-text'
  }`;

interface TranslateTabProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  vocab: VocabItem[];
  t: (key: string) => string;
  showToast: (message: string, type?: 'info' | 'error' | 'success') => void;
  isListening: boolean;
  interimTranscript: string;
  activeTab: string;
  setContext: (context: ConversationContext | null) => void;
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
  /** Lifted into App so the text survives tab and layout changes. */
  translate: TranslateTabState;
}

export function TranslateTabMobile({
  state,
  setState,
  vocab,
  t,
  showToast,
  isListening,
  interimTranscript,
  activeTab,
  setContext,
  stopSpeaking,
  setLoading,
  isStreaming,
  setIsStreaming,
  handleToggleListening,
  handleSpeak,
  handleCopy,
  isSpeaking,
  isCopied,
  loading,
  translate,
}: TranslateTabProps) {
  const {
    translateInput,
    setTranslateInput,
    translateImage,
    setTranslateImage,
    targetLang,
    setTargetLang,
    isSummaryMode,
    setIsSummaryMode,
    isTranslating,
    isCached,
    matchedTerms,
    handleTranslate,
    handleClearInput,
    handleImageUpload,
    handlePaste,
    handlePasteFromClipboard,
    translateInputWithInterim,
  } = translate;

  const outputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // The switch is a bare button; the row label is its accessible name.
  const summaryLabelId = useId();

  const output = state.lastOutputs.translatedText;
  const charCount = translateInputWithInterim.length;

  useEffect(() => {
    if (state.lastOutputs.translatedText && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [state.lastOutputs.translatedText]);

  const toggleSummaryMode = () => setIsSummaryMode(prev => !prev);

  const handleNativeShare = async (text: string, title: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: text,
        });
      } catch (err) {
        console.log('Share dismissed or failed:', err);
      }
    } else {
      await handleCopy(text);
    }
  };

  return (
    <motion.div
      key="translate"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      /* --tab-bar-h is the tab bar's measured height, published on <html> by
         LayoutMobile. LayoutMobile's <main> already pays the first 5rem of it
         with pb-20, so only the excess is added here — a bar that outgrows
         that (a home indicator, a larger text size) still clears, and a short
         one costs no dead space. That height already contains
         env(safe-area-inset-bottom) through the bar's own padding, so pb-safe
         here would count the home indicator a second time. */
      className="pb-[max(0px,calc(var(--tab-bar-h)-5rem))]"
    >
      {/* --- Source text ---------------------------------------------------
          One inset group: the field, then whatever it has picked up (image,
          glossary hits, mic state), then the accessory toolbar. */}
      <h3 className="ios-section-header">{t('inputSource')}</h3>

      <div className="ios-inset-group">
        <textarea
          className="ios-separator block h-40 min-h-[120px] w-full resize-none bg-transparent px-4 py-3 text-[17px] leading-relaxed text-text-main placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-text"
          placeholder={t('inputPlaceholder')}
          value={translateInputWithInterim}
          onChange={e => setTranslateInput(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={e => {
            // isComposing: Telex and Pinyin commit a candidate with Enter, so
            // without this the keystroke that finishes a Vietnamese or Chinese
            // word is swallowed and translates a half-typed input instead.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleTranslate();
            }
          }}
          maxLength={MAX_INPUT}
        />

        {translateImage && (
          <div className="ios-row ios-separator">
            {/* Decorative: the label beside it already names the attachment. */}
            <img
              src={translateImage}
              alt=""
              aria-hidden="true"
              className="h-11 w-11 shrink-0 rounded-lg border border-border-main object-cover"
            />
            <span className="min-w-0 flex-1 truncate">{t('imageAttached')}</span>
            {/* Was hover-only, which on a touch screen meant unreachable. */}
            <button
              type="button"
              onClick={() => setTranslateImage(null)}
              aria-label={t('removeImage')}
              title={t('removeImage')}
              className={`${toolbarButton()} -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full`}
            >
              <X size={20} />
            </button>
          </div>
        )}

        {matchedTerms.length > 0 && (
          <div className="ios-separator px-4 py-2.5">
            <p className="text-[13px] text-ios-label-secondary">{t('detectedTerms')}</p>
            {/* The strip bleeds to the card edge while the first chip stays on
                the 16px inset. data-no-swipe keeps a sideways drag here instead
                of letting it change tab. */}
            <div
              data-no-swipe
              className="no-scrollbar -mx-4 mt-1.5 flex gap-1.5 overflow-x-auto px-4"
            >
              {matchedTerms.map(match => (
                <span
                  /* One row can match twice (its VI and EN phrases both present), so the span pins the key. */
                  key={`${match.item.id}-${match.start}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ios-fill px-2.5 py-1 text-[13px]"
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

        {/* A row of its own rather than a badge floating over the field: the
            interim transcript lands in the textarea, and the badge used to sit
            on top of the line it was writing. */}
        {isListening && (
          <div className={`ios-row ios-separator gap-2 text-[13px] font-semibold uppercase tracking-widest ${RECORDING_TEXT}`}>
            <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-current" />
            <span>{t('listening')}</span>
          </div>
        )}

        {/* Accessory toolbar, not four buttons floating over the text: at the
            44px floor they would cover a third of the typing area, and iOS
            never puts a control on top of the text being edited. */}
        <div className="ios-toolbar">
          <button
            type="button"
            onClick={handleClearInput}
            aria-label={t('clearInput')}
            title={t('clearInput')}
            className={toolbarButton()}
          >
            <X size={20} />
          </button>
          {/* Cleared on open, or picking the same photo again after removing it
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
            aria-label={t('uploadImage')}
            title={t('uploadImage')}
            className={toolbarButton()}
          >
            <Camera size={20} />
          </button>
          <VoiceVisualizer
            isListening={isListening}
            onClick={handleToggleListening}
            title={isListening ? t('listeningActive') : t('startVoice')}
          />
          <button
            type="button"
            onClick={handlePasteFromClipboard}
            aria-label={t('paste')}
            title={t('paste')}
            className={toolbarButton()}
          >
            <ClipboardCheck size={20} />
          </button>
        </div>
      </div>

      {/* maxLength stops typing at the cap, but dictation and the clipboard
          append past it and the over-long text is still what gets sent — so
          the count is the only signal either way, and carries its own weight
          from the cap upwards. */}
      <p
        className={`ios-section-footer text-right tabular-nums ${
          charCount >= MAX_INPUT ? 'font-medium text-text-main' : ''
        }`}
      >
        {charCount} / {MAX_INPUT}
      </p>

      {/* --- Options -------------------------------------------------------- */}
      <h3 className="ios-section-header">{t('translationOptions')}</h3>

      <div className="ios-inset-group">
        {/* A native <select> stretched transparently over a presentation layer:
            on iOS that is what summons the real wheel picker, which no custom
            menu imitates. The visual layer takes no pointer events, so the tap
            always reaches the select — and the select covers the whole row, so
            the label is part of the target too. The ring is keyed off the
            select's own focus-visible because an opacity-0 control cannot show
            one itself. */}
        <div className="ios-row ios-separator relative has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-inset has-[select:focus-visible]:ring-accent-text">
          {/* aria-hidden: the select below is named with these same words, and
              without this the row announces "Target Language" twice. */}
          <span aria-hidden="true" className="min-w-0 flex-1 truncate">{t('targetLanguage')}</span>
          {/* Capped so the value cannot push the label off a 320px screen;
              both sides truncate rather than wrap. */}
          <span aria-hidden="true" className="pointer-events-none flex max-w-[60%] shrink-0 items-center gap-1 text-ios-label-secondary">
            <span className="truncate">{LANGUAGE_FLAGS[targetLang]} {targetLang}</span>
            <ChevronDown size={18} className="shrink-0" />
          </span>
          <select
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={targetLang}
            onChange={e => setTargetLang(e.target.value as Language)}
            aria-label={t('targetLanguage')}
          >
            {LANGUAGES.map(l => <option key={l} value={l} className="bg-panel text-text-main">{LANGUAGE_FLAGS[l]} {l}</option>)}
          </select>
        </div>

        {/* The switch is the only focusable control, as on iOS; the row keeps a
            pointer handler because the label was tappable before this and the
            words are the easier target with a thumb. stopPropagation on the
            switch keeps a tap on it from toggling twice. */}
        <div className="ios-row cursor-pointer" onClick={toggleSummaryMode}>
          <span id={summaryLabelId} className="min-w-0 flex-1 truncate">{t('summaryMode')}</span>
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

      <p className="ios-section-footer">{t('summaryModeHint')}</p>

      <button
        onClick={() => handleTranslate()}
        disabled={loading || isTranslating || isStreaming || (!translateInput.trim() && !translateImage)}
        className="saas-button primary-button mt-6 w-full shadow-lg shadow-accent/20"
      >
        {loading ? <Loader2 className="animate-spin" size={20} /> : <Languages size={20} />}
        <span>{t('translate')}</span>
      </button>

      {/* --- Output --------------------------------------------------------- */}
      <div className="ios-section-header flex items-center gap-2">
        <h3 className="min-w-0 truncate">{t('translatedOutput')}</h3>
        {loading && (
          <span className="inline-flex shrink-0 animate-pulse items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-accent-text">
            <Loader2 size={10} className="animate-spin" aria-hidden="true" />
            {t('translating')}
          </span>
        )}
      </div>

      <div ref={outputRef} className="ios-inset-group">
        {/* pre-wrap is load-bearing: the model streams single newlines that
            Markdown would otherwise fold into one paragraph. */}
        <div className="ios-separator min-h-[100px] whitespace-pre-wrap px-4 py-3 text-[17px] leading-relaxed text-text-main">
          {output ? (
            <div className="markdown-body">
              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{output}</Markdown>
            </div>
          ) : (
            <span className="italic text-text-muted">{t('translationPlaceholder')}</span>
          )}
        </div>

        {output && (
          <div className="ios-toolbar justify-end">
            <button
              type="button"
              onClick={() => handleSpeak(output, targetLang)}
              aria-label={isSpeaking ? t('stopSpeaking') : t('speakText')}
              title={isSpeaking ? t('stopSpeaking') : t('speakText')}
              className={toolbarButton(isSpeaking)}
            >
              {isSpeaking ? <Square size={20} /> : <Volume2 size={20} />}
            </button>
            <button
              type="button"
              onClick={() => handleCopy(output)}
              aria-label={t('copy')}
              title={t('copy')}
              className={toolbarButton(isCopied)}
            >
              {isCopied ? <Check size={20} /> : <Copy size={20} />}
            </button>
            <button
              type="button"
              onClick={() => handleNativeShare(output, t('translatedOutput'))}
              aria-label={t('share')}
              title={t('share')}
              className={toolbarButton()}
            >
              <Share2 size={20} />
            </button>
          </div>
        )}
      </div>

      {output && isCached && (
        <p className="ios-section-footer flex items-center gap-1.5">
          <Zap size={13} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 truncate">{t('instantTranslation')}</span>
        </p>
      )}
    </motion.div>
  );
}
