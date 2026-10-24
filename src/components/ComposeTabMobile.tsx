import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Loader2, PenTool, X, Square, Volume2, Copy, Check, Share2 } from 'lucide-react';
import { PresetGrid } from './common/PresetGrid';
import { useTabActive } from '../hooks/useTabNavigation';
import { VoiceVisualizer } from './common/VoiceVisualizer';
import { AppState } from '../types';
import { useComposeTab } from '../hooks/useComposeTab';

type ComposeTabState = ReturnType<typeof useComposeTab>;

/** Mirrors the textarea's maxLength; the footer counter reads the same number. */
const MAX_INPUT = 1500;

/**
 * The recording indicator has to read as "live" in all four palettes, so it
 * cannot come from an accent token. Same value and the same data-theme keying
 * as TranslateTabMobile's RECORDING_TEXT and SystemSection's DANGER_TEXT —
 * Tailwind's `dark:` is a prefers-color-scheme query and would ignore a palette
 * the user chose by hand.
 */
const RECORDING_TEXT =
  'text-red-600 [[data-theme=dark]_&]:text-red-400 [[data-theme=cyberpunk]_&]:text-red-400 [[data-theme=industrial]_&]:text-red-400';

/**
 * Colour and feedback for an icon button. Inside an .ios-toolbar the 44px box
 * comes from the stylesheet, so nothing here restates it — a width or height
 * utility would not apply anyway, since that rule is deliberately unlayered.
 * No transition-* utility either: it would land in the utilities layer and
 * override .ios-press's transition-transform, leaving the tap-down scale
 * instant. `active` swaps the whole colour utility instead of appending one:
 * two text-* utilities on the same element are resolved by stylesheet order,
 * not by the order they were written in.
 */
const toolbarButton = (active = false) =>
  `ios-press active:bg-bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text ${
    active ? 'text-accent-text' : 'text-text-muted hover:text-accent-text'
  }`;

/**
 * Only what this layout reads. App hands the whole tab bundle down through
 * ComposeTab, so the parent needs no change when a prop stops being used here
 * — and a prop that is declared but never read is a standing invitation to
 * wire the wrong one up. `state`/`compose` carry everything else.
 */
interface ComposeTabProps {
  state: AppState;
  t: (key: string) => string;
  /** Gates the interim transcript: the recogniser is shared with Talk. */
  activeTab: string;
  isListening: boolean;
  interimTranscript: string;
  handleToggleListening: () => void;
  handleSpeak: (text: string, lang: string) => void;
  copyToClipboard: (text: string) => Promise<void>;
  isSpeaking: boolean;
  loading: boolean;
  /** Lifted into App so the text survives tab and layout changes. */
  compose: ComposeTabState;
}

export function ComposeTabMobile({
  state,
  t,
  activeTab,
  isListening,
  interimTranscript,
  handleToggleListening,
  handleSpeak,
  copyToClipboard,
  isSpeaking,
  loading,
  compose,
}: ComposeTabProps) {
  const {
    composeReq,
    setComposeReq,
    activePresetId,
    setActivePresetId,
    composeParams,
    setComposeParams,
    isComposing,
    handleCompose,
  } = compose;

  const [isCopied, setIsCopied] = useState(false);
  // The action bar below is portalled into <body>, where the tab's
  // `display: none` cannot reach it — it stayed docked over every other tab.
  const isTabActive = useTabActive();
  const tInterim = isListening && interimTranscript ? interimTranscript : '';
  const composeInputWithInterim = composeReq + (activeTab === 'compose' && tInterim ? (composeReq && !composeReq.endsWith(' ') ? ' ' : '') + tInterim : '');
  const charCount = composeInputWithInterim.length;

  /* Deliberately no auto-scroll to the output. The reply streams in token by
     token, so an effect watching the text re-scrolls on every chunk and fights
     the user's own scrolling; and watching "is there output at all" instead
     fires on mount for the reply restored from storage, which jumped a
     freshly opened tab past the field the user came to type in. The success
     toast is the arrival signal. */
  const output = state.lastOutputs.generatedReply;
  const subject = state.lastOutputs.subject;

  const handleCopy = async (text: string) => {
    await copyToClipboard(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

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
      key="compose"
      /* A fade and a short rise, not a sideways slide: TabPage already carries
         the horizontal travel between tabs, and a second x offset here read as
         the page overshooting itself. Same arrival as TranslateTabMobile. */
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
      {/* --- Requirements ---------------------------------------------------
          One inset group: the field, the mic state, then the accessory bar. */}
      <h3 className="ios-section-header">{t('replyRequirements')}</h3>

      <div className="ios-inset-group">
        <textarea
          className="ios-separator block h-40 min-h-[120px] w-full resize-none bg-transparent px-4 py-3 text-[17px] leading-relaxed text-text-main placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-text"
          placeholder={t('replyPlaceholder')}
          value={composeInputWithInterim}
          onChange={e => setComposeReq(e.target.value)}
          onKeyDown={e => {
            // isComposing: Telex and Pinyin commit a candidate with Enter, so
            // without this the keystroke that finishes a Vietnamese or Chinese
            // word is swallowed and a half-typed requirement is what gets
            // composed.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleCompose();
            }
          }}
          maxLength={MAX_INPUT}
        />

        {/* A row of its own rather than a badge floating over the field: the
            interim transcript lands in the textarea, and the badge used to sit
            on top of the line it was dictating into. */}
        {isListening && (
          <div className={`ios-row ios-separator gap-2 text-[13px] font-semibold uppercase tracking-widest ${RECORDING_TEXT}`}>
            <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-current" />
            <span>{t('listening')}</span>
          </div>
        )}

        {/* Accessory toolbar, not two buttons floating over the text: at the
            44px touch floor they covered a third of the typing area, and iOS
            never puts a control on top of the text being edited. */}
        <div className="ios-toolbar">
          <button
            type="button"
            onClick={() => setComposeReq('')}
            aria-label={t('clearInput')}
            title={t('clearInput')}
            className={toolbarButton()}
          >
            <X size={20} />
          </button>
          <VoiceVisualizer
            isListening={isListening}
            onClick={handleToggleListening}
            title={isListening ? t('listeningActive') : t('startVoice')}
          />
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

      {/* A sibling, not a nested block: PresetGrid brings its own section
          headers, inset groups and footer. */}
      <PresetGrid
        activePresetId={activePresetId}
        onSelectPreset={(preset) => {
          setActivePresetId(preset.id);
          setComposeParams(prev => ({ ...prev, ...preset.settings }));
        }}
        customParams={composeParams}
        onUpdateCustomParams={(params) => setComposeParams(prev => ({ ...prev, ...params }))}
        t={t}
      />

      {/* --- Output --------------------------------------------------------- */}
      <div className="ios-section-header flex items-center gap-2">
        <h3 className="min-w-0 truncate">{t('generatedOutput')}</h3>
        {isComposing && (
          <span className="inline-flex shrink-0 animate-pulse items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-accent-text">
            <Loader2 size={10} className="animate-spin" aria-hidden="true" />
            {t('generating')}
          </span>
        )}
      </div>

      {/* Always on screen, empty or not: the group is what the docked Generate
          button scrolls to, and a tab that changes shape on the first reply
          moves the preset rows out from under the thumb. */}
      <div className="ios-inset-group">
        {/* Only the formal_email format produces one; useComposeTab peels the
            "Subject:" line off the body, so it needs a home of its own rather
            than being lost in the first paragraph. */}
        {subject && (
          <div className="ios-separator px-4 py-2.5">
            <span className="block text-[13px] text-ios-label-secondary">{t('subject')}</span>
            <p className="mt-0.5 text-[17px] font-semibold leading-snug text-text-main">{subject}</p>
          </div>
        )}

        {/* pre-wrap is load-bearing: the model streams single newlines that
            Markdown would otherwise fold into one paragraph. */}
        <div className="ios-separator min-h-[100px] whitespace-pre-wrap px-4 py-3 text-[17px] leading-relaxed text-text-main">
          {output ? (
            <div className="markdown-body">
              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{output}</Markdown>
            </div>
          ) : (
            <span className="italic text-text-muted">{t('generatedReplyPlaceholder')}</span>
          )}
        </div>

        {output && (
          <div className="ios-toolbar justify-end">
            <button
              type="button"
              onClick={() => handleSpeak(output, composeParams.lang)}
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
              onClick={() => handleNativeShare(output, subject || t('generatedOutput'))}
              aria-label={t('share')}
              title={t('share')}
              className={toolbarButton()}
            >
              <Share2 size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Action button, docked just above the tab bar.

          Rendered through a portal into <body>: the page wrapper carries a
          transform for the duration of a swipe, and a transformed ancestor
          becomes the containing block for its position: fixed children — which
          made this bar travel with the gesture and settle back. Same escape
          hatch, and the same reason, as SystemSection and SettingsPageHeader.

          bottom is --tab-bar-h, published by LayoutMobile from the bar's
          measured height. It replaces a hardcoded 90px that was tuned to the
          old 96px tab bar and left a ~26px gap under the real 63.5px one. */}
      {typeof document === 'undefined' || !isTabActive ? null : createPortal(
        <div className="fixed bottom-[var(--tab-bar-h)] left-0 right-0 p-4 bg-gradient-to-t from-app via-app/80 to-transparent pointer-events-none z-40">
          <div className="max-w-3xl mx-auto pointer-events-auto">
            <button
              onClick={handleCompose}
              disabled={loading || !composeReq.trim()}
              className="saas-button primary-button w-full shadow-lg shadow-accent/20"
            >
              {isComposing ? <Loader2 className="animate-spin" size={20} /> : <PenTool size={20} />}
              <span>{t('generateReply')}</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </motion.div>
  );
}
