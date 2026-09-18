import React, { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { PenTool, Loader2, Copy, Check, Share2, Square, Volume2, X } from 'lucide-react';
import { AppState } from '../types';
import { useComposeTab } from '../hooks/useComposeTab';
import { VoiceVisualizer } from './common/VoiceVisualizer';
import { PresetGrid } from './common/PresetGrid';

type ComposeTabState = ReturnType<typeof useComposeTab>;

/** Mirrors the textarea's maxLength; the footer counter reads the same number. */
const MAX_INPUT = 1500;

/**
 * Twin of the constant in ComposeTabMobile: the recording indicator has to read
 * as "live" in all four palettes, so it cannot come from an accent token, and
 * Tailwind's `dark:` is a prefers-color-scheme query that would ignore a
 * palette the user chose by hand.
 */
const RECORDING_TEXT =
  'text-red-600 [[data-theme=dark]_&]:text-red-400 [[data-theme=cyberpunk]_&]:text-red-400 [[data-theme=industrial]_&]:text-red-400';

/**
 * Colour and feedback for an icon button. Twin of ComposeTabMobile's, plus a
 * hover fill because this layout is driven by a pointer. Inside an .ios-toolbar
 * the 44px box comes from the stylesheet, so nothing here restates it — a width
 * or height utility would not apply anyway, that rule being deliberately
 * unlayered. No transition-* utility either: it would land in the utilities
 * layer and override .ios-press's transition-transform, leaving the press scale
 * instant. `active` swaps the whole colour utility instead of appending one,
 * because two text-* utilities on one element are resolved by stylesheet order,
 * not by the order they were written in.
 */
const toolbarButton = (active = false) =>
  `ios-press hover:bg-bg-input active:bg-bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-text ${
    active ? 'text-accent-text' : 'text-text-muted hover:text-accent-text'
  }`;

/**
 * Only what this layout reads. App hands the whole tab bundle down through
 * ComposeTab, so the parent needs no change when a prop stops being used here —
 * and a prop that is declared but never read is a standing invitation to wire
 * the wrong one up. Same trimming, and the same reason, as ComposeTabMobile.
 */
interface ComposeTabDesktopProps {
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
  userPreferences?: any;
  /** Lifted into App so the text survives tab and layout changes. */
  compose: ComposeTabState;
}

export function ComposeTabDesktop(props: ComposeTabDesktopProps) {
  const {
    composeReq,
    setComposeReq,
    activePresetId,
    setActivePresetId,
    composeParams,
    setComposeParams,
    isComposing,
    handleCompose,
  } = props.compose;

  const [isCopied, setIsCopied] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  const hasBgImage =
    !!props.userPreferences?.backgroundImage ||
    (props.userPreferences?.backgroundEffect && props.userPreferences.backgroundEffect !== 'none');

  const tInterim = props.isListening && props.interimTranscript ? props.interimTranscript : '';
  const composeInputWithInterim =
    composeReq +
    (props.activeTab === 'compose' && tInterim ? (composeReq && !composeReq.endsWith(' ') ? ' ' : '') + tInterim : '');
  const charCount = composeInputWithInterim.length;

  const output = props.state.lastOutputs.generatedReply;
  const subject = props.state.lastOutputs.subject;

  // Pin the streaming reply to its own last line rather than scrolling the pane.
  useEffect(() => {
    if (outputRef.current && isComposing) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, isComposing]);

  const handleCopy = async (text: string) => {
    await props.copyToClipboard(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!output) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: subject || props.t('generatedOutput'), text: output });
      } catch (e) {
        // A dismissed share sheet rejects, which is not a failure worth reporting.
      }
    } else {
      handleCopy(output);
    }
  };

  return (
    /* Two panes at full height, each scrolling on its own — the split is what a
       wide viewport is for; the grouped-list vocabulary inside it is shared with
       the mobile layout. Same frame as TranslateTabDesktop. */
    <div
      className={`grid h-[calc(100vh-140px)] min-h-0 w-full grid-cols-2 gap-6 overflow-hidden p-6 pb-4 transition-all duration-300 ${
        hasBgImage ? 'bg-transparent' : 'bg-app'
      }`}
    >
      {/* --- Left: what to write, then the controls that shape it ----------- */}
      <div className="custom-scrollbar flex min-h-0 flex-col overflow-y-auto">
        <h2 className="ios-section-header shrink-0 pt-0">{props.t('replyRequirements')}</h2>

        {/* Only this group flexes, so a short window shrinks the typing area
            rather than the controls. .ios-inset-group is already bg-surface,
            the token meant for a panel over a wallpaper — the blur is the only
            part still conditional. */}
        <div className={`ios-inset-group flex min-h-[12rem] shrink-0 flex-col ${hasBgImage ? 'backdrop-blur-md' : ''}`}>
          <textarea
            value={composeInputWithInterim}
            onChange={e => setComposeReq(e.target.value)}
            onKeyDown={e => {
              // isComposing: Telex and Pinyin commit a candidate with Enter, so
              // without this the keystroke that finishes a Vietnamese or Chinese
              // word is swallowed and a half-typed input is submitted.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleCompose();
              }
            }}
            placeholder={props.t('replyPlaceholder')}
            maxLength={MAX_INPUT}
            className="ios-separator custom-scrollbar min-h-[10rem] w-full flex-1 resize-none overflow-y-auto bg-transparent px-4 py-3 text-base leading-relaxed text-text-main placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-text"
          />

          {/* The interim transcript lands in the textarea itself, so the state
              needs saying somewhere that is not on top of the text being typed. */}
          {props.isListening && (
            <div
              className={`ios-row ios-separator shrink-0 gap-2 text-[13px] font-semibold uppercase tracking-widest ${RECORDING_TEXT}`}
            >
              <span aria-hidden="true" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-current" />
              <span>{props.t('listening')}</span>
            </div>
          )}

          {/* An accessory bar, not controls floating over the field: at the 44px
              touch floor they covered the text being edited, and a pointer has
              no more right to type under a button than a thumb does. */}
          <div className="ios-toolbar shrink-0">
            <button
              type="button"
              onClick={() => setComposeReq('')}
              aria-label={props.t('clearInput')}
              title={props.t('clearInput')}
              className={toolbarButton()}
            >
              <X size={20} />
            </button>
            {/* One mic, not a plain button plus a visualizer that appeared beside
                it the moment recording started. */}
            <VoiceVisualizer
              isListening={props.isListening}
              onClick={props.handleToggleListening}
              title={props.isListening ? props.t('listeningActive') : props.t('startVoice')}
            />
          </div>
        </div>

        {/* maxLength stops typing at the cap, but dictation appends past it and
            the over-long text is still what gets sent — so the count is the only
            signal either way, and carries its own weight from the cap upwards. */}
        <p
          className={`ios-section-footer shrink-0 text-right tabular-nums ${
            charCount >= MAX_INPUT ? 'font-medium text-text-main' : ''
          }`}
        >
          {charCount} / {MAX_INPUT}
        </p>

        <p className="ios-section-footer shrink-0">{props.t('enterToComposeHint')}</p>

        {/* The same control the mobile tab uses, rather than this file's own
            preset bar plus a modal: the parameters were reachable here only by
            opening a dialog, and its hand-written <option> values had drifted
            out of the type unions — `management`, `team`, `external`,
            `friendly`, `direct`, `diplomatic`, `bullet_points` matched no entry
            at the server and rendered blank in every other picker. Driving both
            layouts off one component is what keeps that from happening twice. */}
        <div className="shrink-0">
          <PresetGrid
            activePresetId={activePresetId}
            onSelectPreset={preset => {
              setActivePresetId(preset.id);
              setComposeParams(prev => ({ ...prev, ...preset.settings }));
            }}
            customParams={composeParams}
            onUpdateCustomParams={params => setComposeParams(prev => ({ ...prev, ...params }))}
            t={props.t}
          />
        </div>

        <button
          onClick={handleCompose}
          disabled={props.loading || !composeReq.trim()}
          className="saas-button primary-button mt-4 w-full shrink-0 shadow-lg shadow-accent/20"
        >
          {isComposing ? <Loader2 className="animate-spin" size={20} /> : <PenTool size={20} />}
          <span>{props.t('generateReply')}</span>
        </button>
      </div>

      {/* --- Right: the reply ---------------------------------------------- */}
      <div className="flex min-h-0 flex-col">
        <div className="ios-section-header flex shrink-0 items-center gap-2 pt-0">
          <h2 className="min-w-0 truncate">{props.t('generatedOutput')}</h2>
          {/* isComposing, not the App-wide `loading`: that flag is raised by any
              request, so this badge used to claim "Composing…" while a
              translation was in flight in another tab. */}
          {isComposing && (
            <span className="inline-flex shrink-0 animate-pulse items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-accent-text">
              <Loader2 size={10} className="animate-spin" aria-hidden="true" />
              {props.t('generating')}
            </span>
          )}
        </div>

        <div className={`ios-inset-group flex min-h-0 flex-1 flex-col ${hasBgImage ? 'backdrop-blur-md' : ''}`}>
          {/* Its own row, because the model is told to put the subject on line 1
              for a formal email and useComposeTab peels it off there. */}
          {subject && (
            <div className="ios-separator shrink-0 px-4 py-3">
              <span className="block text-[13px] text-ios-label-secondary">{props.t('subject')}</span>
              <span className="mt-0.5 block font-semibold text-text-main">{subject}</span>
            </div>
          )}

          {/* pre-wrap is load-bearing: the model streams single newlines that
              Markdown would otherwise fold into one paragraph. */}
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
            ) : isComposing ? (
              /* Only until the first chunk lands — after that the text itself is
                 the progress, which is what the auto-scroll is there for. */
              <div className="flex h-full flex-col items-center justify-center gap-4 text-text-muted">
                <Loader2 size={32} className="animate-spin text-accent-text" />
                <p className="animate-pulse font-medium">{props.t('generating')}</p>
              </div>
            ) : (
              <span className="italic text-text-muted">{props.t('composeOutputPlaceholder')}</span>
            )}
          </div>

          {output && !isComposing && (
            <div className="ios-toolbar shrink-0 justify-end">
              <button
                type="button"
                onClick={() => props.handleSpeak(output, composeParams.lang)}
                aria-label={props.isSpeaking ? props.t('stopSpeaking') : props.t('speakText')}
                title={props.isSpeaking ? props.t('stopSpeaking') : props.t('speakText')}
                className={toolbarButton(props.isSpeaking)}
              >
                {props.isSpeaking ? <Square size={20} /> : <Volume2 size={20} />}
              </button>
              <button
                type="button"
                onClick={() => handleCopy(output)}
                aria-label={props.t('copy')}
                title={props.t('copy')}
                className={toolbarButton(isCopied)}
              >
                {isCopied ? <Check size={20} /> : <Copy size={20} />}
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
      </div>
    </div>
  );
}
