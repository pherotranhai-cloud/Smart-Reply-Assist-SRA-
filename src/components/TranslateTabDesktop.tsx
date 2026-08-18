import React, { useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Languages, Loader2, X, Camera, ClipboardCheck, Square, Volume2, Copy, Check, Share2, BookOpen, Mic, ChevronDown } from 'lucide-react';
import { LANGUAGES, LANGUAGE_FLAGS } from '../constants';
import { Language, AppState, VocabItem, ConversationContext } from '../types';
import { VoiceVisualizer } from './common/VoiceVisualizer';
import { useTranslateTab } from '../hooks/useTranslateTab';

type TranslateTabState = ReturnType<typeof useTranslateTab>;

interface TranslateTabDesktopProps {
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
  userPreferences?: any;
  /** Lifted into App so the text survives tab and layout changes. */
  translate: TranslateTabState;
}

export function TranslateTabDesktop(props: TranslateTabDesktopProps) {
  const {
    translateInput, setTranslateInput, translateImage, setTranslateImage,
    targetLang, setTargetLang, isSummaryMode, setIsSummaryMode,
    isTranslating, isCached, matchedTerms, getVocabTranslation,
    handleTranslate, handleClearInput,
    handleImageUpload, handlePaste, handlePasteFromClipboard,
    translateInputWithInterim
  } = props.translate;

  const hasBgImage = !!props.userPreferences?.backgroundImage || (props.userPreferences?.backgroundEffect && props.userPreferences.backgroundEffect !== 'none');

  const outputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (outputRef.current && (isTranslating || props.isStreaming)) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [props.state.lastOutputs.translatedText, isTranslating, props.isStreaming]);

  const handleShare = async () => {
    const text = props.state.lastOutputs.translatedText;
    if (!text) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Translated Text',
          text: text,
        });
      } catch (e) {
        console.log('Share canceled or failed', e);
      }
    } else {
      props.handleCopy(text);
    }
  };

  return (
    <div className={`grid grid-cols-2 gap-6 w-full h-[calc(100vh-140px)] min-h-0 overflow-hidden pb-4 p-6 transition-all duration-300 ${
      hasBgImage ? 'bg-transparent' : 'bg-app'
    }`}>
      {/* Left Column: Input & Vocab */}
      <div className="flex flex-col h-full min-h-0 gap-4">
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Languages size={20} className="text-accent" />
            <h2 className="font-semibold text-lg text-text-main">{props.t('translate')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSummaryMode(!isSummaryMode)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isSummaryMode ? 'bg-accent text-white' : 'bg-bg-input text-text-muted hover:bg-border-main/50'
              }`}
            >
              {props.t('summaryMode')}
            </button>
          </div>
        </div>

        <div className={`relative flex-1 flex flex-col h-full min-h-0 border border-border-main rounded-3xl p-5 overflow-hidden transition-all duration-300 ${
          hasBgImage ? 'bg-panel/20 backdrop-blur-md' : 'bg-panel'
        }`}>
          <textarea
            value={translateInputWithInterim}
            onChange={(e) => {
              setTranslateInput(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleTranslate(false);
              }
            }}
            onPaste={handlePaste}
            placeholder={props.t('inputPlaceholder')}
            className="flex-1 w-full h-full overflow-y-auto resize-none bg-transparent focus:outline-none focus:ring-0 custom-scrollbar text-text-main text-base border-none p-0"
          />
          
          {translateImage && (
            <div className="absolute top-4 right-4 relative w-32 h-32 rounded-xl overflow-hidden border-2 border-accent shadow-lg mb-4 ml-4 group">
              <img src={translateImage} alt="Uploaded" className="w-full h-full object-cover" />
              <button 
                onClick={() => setTranslateImage(null)}
                className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-border-main flex items-center justify-between bg-transparent flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                ref={fileInputRef}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-text-muted hover:text-accent hover:bg-accent/10 rounded-xl transition-colors"
                title={props.t('uploadImage')}
              >
                <Camera size={20} />
              </button>
              <button
                onClick={handlePasteFromClipboard}
                className="p-2 text-text-muted hover:text-accent hover:bg-accent/10 rounded-xl transition-colors"
                title={props.t('paste')}
              >
                <ClipboardCheck size={20} />
              </button>
              <button
                onClick={props.handleToggleListening}
                className={`p-2 rounded-xl transition-all ${
                  props.isListening 
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' 
                    : 'text-text-muted hover:text-accent hover:bg-accent/10'
                }`}
                title={props.isListening ? props.t('listeningActive') : props.t('startVoice') || 'Nói'}
              >
                {props.isListening ? <Square size={20} /> : <Mic size={20} />}
              </button>
              {props.isListening && <VoiceVisualizer isListening={true} onClick={props.handleToggleListening} />}
            </div>
            
            <div className="flex items-center gap-2">
              {translateInput && (
                <button
                  onClick={handleClearInput}
                  className="p-2 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              )}
              <button
                onClick={() => handleTranslate(false)}
                disabled={props.loading || isTranslating || props.isStreaming || (!translateInput.trim() && !translateImage)}
                className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-white rounded-xl font-semibold transition-all shadow-md shadow-accent/20 disabled:opacity-50 flex items-center gap-2 text-sm"
              >
                {props.loading || isTranslating ? <Loader2 className="animate-spin" size={16} /> : <Languages size={16} />}
                <span>{props.t('translate') || 'Dịch'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Matched Vocab */}
        {matchedTerms.length > 0 && (
          <div className="bg-accent/5 dark:bg-accent/10 border border-accent/20 rounded-2xl p-4 overflow-y-auto max-h-48 custom-scrollbar flex-shrink-0">
            <div className="text-xs font-semibold text-accent uppercase tracking-wider mb-2 flex items-center gap-1">
              <BookOpen size={14} />
              {props.t('matchedVocab') || 'Từ vựng khớp'}
            </div>
            <div className="flex flex-wrap gap-2">
              {matchedTerms.map((item, idx) => (
                <div key={idx} className={`border border-border-main rounded-lg px-3 py-1.5 text-sm shadow-sm flex flex-col transition-all duration-300 ${
                  hasBgImage ? 'bg-panel/30' : 'bg-panel'
                }`}>
                  <span className="font-medium text-text-main">{item.term}</span>
                  <span className="text-accent font-semibold">{getVocabTranslation(item, targetLang)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Output */}
      <div className={`flex flex-col h-full min-h-0 border border-border-main rounded-3xl p-5 justify-between relative transition-all duration-300 ${
        hasBgImage ? 'bg-panel/20 backdrop-blur-md' : 'bg-panel'
      }`}>
        {/* Top bar: Header & Target Lang Selector */}
        <div className="flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-semibold text-text-muted uppercase tracking-wider">
            {props.t('translation') || 'Bản dịch'}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">{props.t('targetLanguage')}:</span>
            <div className="relative inline-block w-40">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 px-3 py-2 rounded-xl pointer-events-none w-full justify-between border border-border-main">
                <span className="text-text-main">{LANGUAGE_FLAGS[targetLang]} {targetLang}</span>
                <ChevronDown size={14} className="text-text-muted shrink-0" />
              </div>
              <select 
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-20"
                value={targetLang}
                onChange={e => setTargetLang(e.target.value as Language)}
              >
                {LANGUAGES.map(l => <option key={l} value={l} className="bg-panel text-text-main">{LANGUAGE_FLAGS[l]} {l}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Output Content */}
        <div 
          ref={outputRef}
          className="flex-1 w-full overflow-y-auto my-4 pr-2 custom-scrollbar"
        >
          {props.loading || isTranslating ? (
            <div className="flex flex-col items-center justify-center h-full text-text-muted gap-4">
              <Loader2 size={32} className="animate-spin text-accent" />
              <p className="font-medium animate-pulse">{props.t('translating')}...</p>
            </div>
          ) : props.state.lastOutputs.translatedText ? (
            <div className="markdown-body prose dark:prose-invert max-w-none text-lg">
              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {props.state.lastOutputs.translatedText}
              </Markdown>
              {isCached && (
                <div className="mt-4 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 text-green-600 text-xs font-medium border border-green-500/20">
                  <Check size={12} />
                  Cached
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted opacity-50 text-lg">
              {props.t('translationPlaceholder')}
            </div>
          )}
        </div>

        {/* Actions */}
        {props.state.lastOutputs.translatedText && !props.loading && !isTranslating && (
          <div className="pt-4 border-t border-border-main flex items-center justify-end gap-2 bg-transparent flex-shrink-0">
             <button
              onClick={() => props.handleSpeak(props.state.lastOutputs.translatedText!, targetLang)}
              disabled={props.isSpeaking}
              className="p-3 text-text-muted hover:text-accent hover:bg-accent/10 rounded-xl transition-colors disabled:opacity-50"
              title="Text to Speech"
            >
              <Volume2 size={20} className={props.isSpeaking ? 'animate-pulse text-accent' : ''} />
            </button>
            <button
              onClick={handleShare}
              className="p-3 text-text-muted hover:text-accent hover:bg-accent/10 rounded-xl transition-colors"
              title="Share"
            >
              <Share2 size={20} />
            </button>
            <button
              onClick={() => props.handleCopy(props.state.lastOutputs.translatedText!)}
              className="p-3 text-white bg-accent hover:bg-accent/90 rounded-xl shadow-sm transition-colors flex items-center gap-2"
            >
              {props.isCopied ? <Check size={20} /> : <Copy size={20} />}
              <span className="font-medium">{props.isCopied ? 'Đã chép' : 'Sao chép'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
