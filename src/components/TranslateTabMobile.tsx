import React, { useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Languages, Loader2, X, Camera, ClipboardCheck, Square, Volume2, Copy, Check, Share2, ChevronDown } from 'lucide-react';
import { LANGUAGES, LANGUAGE_FLAGS } from '../constants';
import { Language, AppState, VocabItem, ConversationContext } from '../types';
import { VoiceVisualizer } from './common/VoiceVisualizer';
import { useTranslateTab } from '../hooks/useTranslateTab';

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
  checkRateLimit: () => boolean;
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
  checkRateLimit,
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
  transcript,
  setTranscript,
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
    getVocabTranslation,
    handleTranslate,
    handleClearInput,
    handleImageUpload,
    handlePaste,
    handlePasteFromClipboard,
    translateInputWithInterim,
  } = useTranslateTab({
    state,
    setState,
    vocab,
    t,
    showToast,
    isListening,
    interimTranscript,
    activeTab,
    setContext,
    checkRateLimit,
    stopSpeaking,
    setLoading,
    setIsStreaming,
  });

  useEffect(() => {
    if (transcript && activeTab === 'translate') {
      setTranslateInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript);
      setTranscript('');
    }
  }, [transcript, setTranscript, activeTab, setTranslateInput]);

  const outputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.lastOutputs.translatedText && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [state.lastOutputs.translatedText]);

  const handleNativeShare = async (text: string, title: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: text,
        });
      } catch (err) {
        console.log("Người dùng hủy chia sẻ hoặc lỗi:", err);
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
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="space-y-6"
    >
      <div className="premium-card space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h3 className="text-[11px] font-medium tracking-widest text-slate-400 uppercase">{t('inputSource')}</h3>
            <span className="text-[11px] text-slate-400 font-medium">
              {translateInputWithInterim.length} / 1500
            </span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setTranslateImage(null)}
              className={`text-[10px] px-3 py-1 rounded-full border transition-all ${translateImage ? 'border-accent text-accent bg-accent/10' : 'border-border-main text-muted hover:text-text-main'}`}
            >
              {translateImage ? t('imageAttached') : t('textOnly')}
            </button>
          </div>
        </div>

        <div className="relative">
          <textarea 
            className="saas-input w-full h-40 min-h-[120px] resize-none text-base"
            placeholder={t('inputPlaceholder')}
            value={translateInputWithInterim}
            onChange={e => setTranslateInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleTranslate(false);
              }
            }}
            maxLength={1500}
          />
          {isListening && (
            <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full animate-pulse">
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">{t('listening')}</span>
            </div>
          )}
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button 
              onClick={handleClearInput}
              className="p-2 bg-transparent rounded-xl text-text-muted hover:bg-bg-input active:bg-bg-input hover:text-red-400 transition-colors"
            >
              <X size={18} />
            </button>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 bg-transparent rounded-xl text-text-muted hover:bg-bg-input active:bg-bg-input hover:text-accent transition-colors"
              title={t('uploadImage')}
            >
              <Camera size={18} />
            </button>
            <VoiceVisualizer
              isListening={isListening}
              onClick={handleToggleListening}
              title={isListening ? t('listeningActive') : t('startVoice')}
            />
            <button 
              onClick={handlePasteFromClipboard}
              className="p-2 bg-transparent rounded-xl text-text-muted hover:bg-bg-input active:bg-bg-input hover:text-accent transition-colors"
            >
              <ClipboardCheck size={18} />
            </button>
          </div>
        </div>

        {matchedTerms.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center py-2 px-3 bg-accent/5 dark:bg-accent/10 rounded-2xl border border-accent/10 transition-all">
            <span className="text-xs font-semibold text-accent flex items-center gap-1.5 shrink-0">
              <span>🔍</span> {state.globalLanguage === 'vi' ? 'Phát hiện thuật ngữ' : 'Detected terms'}:
            </span>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {matchedTerms.map(item => {
                const translationText = getVocabTranslation(item, targetLang);
                return (
                  <span 
                    key={item.id} 
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/80 dark:bg-slate-800/80 text-text-main shadow-sm border border-border-main backdrop-blur-sm"
                  >
                    <span className="font-semibold text-accent">{item.term}</span>
                    <span className="text-text-muted text-[10px]">&rarr;</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">{translationText}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {translateImage && (
          <div className="relative inline-block group">
            <img src={translateImage} className="max-h-32 rounded-xl border border-border-main" alt="Pasted" />
            <button 
              onClick={() => setTranslateImage(null)}
              className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={12} />
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
          <div className="flex-1 space-y-2">
            <label className="text-[11px] font-medium tracking-widest text-slate-400 uppercase">{t('targetLanguage')}</label>
            <div className="relative inline-block w-full">
              <div className="flex items-center gap-1 text-xs font-semibold text-accent bg-accent/10 px-4 py-3 rounded-xl pointer-events-none w-full justify-between border border-border-main">
                <span className="text-text-main">{LANGUAGE_FLAGS[targetLang]} {targetLang}</span>
                <ChevronDown size={16} className="text-muted"/>
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
          
          <div className="flex-1 flex flex-col justify-end space-y-2 pb-2">
            <label className="flex items-center gap-3 cursor-pointer" onClick={(e) => { e.preventDefault(); setIsSummaryMode(!isSummaryMode); }}>
              <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shadow-inner ${isSummaryMode ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-panel transition-transform shadow ${isSummaryMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-[11px] font-medium tracking-widest text-slate-400 uppercase select-none">{t('summaryMode')}</span>
            </label>
          </div>
          
          <button 
            onClick={() => handleTranslate(false)}
            disabled={loading || isTranslating || isStreaming || (!translateInput.trim() && !translateImage)}
            className="saas-button primary-button flex-1 sm:flex-none flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <Languages size={20} />}
            <span>{t('translate')}</span>
          </button>
        </div>
      </div>

      <div ref={outputRef} className="premium-card flex flex-col gap-4 bg-panel">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h3 className="text-[11px] font-medium tracking-widest text-slate-400 uppercase">{t('translatedOutput')}</h3>
            {loading && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-accent/10 rounded-full text-[9px] font-bold text-accent uppercase tracking-wider animate-pulse">
                <Loader2 size={10} className="animate-spin" />
                <span>{state.globalLanguage === 'vi' ? 'Dịch ngầm...' : 'Auto-translating...'}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {state.lastOutputs.translatedText && (
              <>
                <button 
                  onClick={() => handleSpeak(state.lastOutputs.translatedText, targetLang)}
                  className={`p-2 transition-colors ${isSpeaking ? 'text-accent animate-pulse' : 'text-muted hover:text-accent'}`}
                >
                  {isSpeaking ? <Square size={18} /> : <Volume2 size={18} />}
                </button>
                <button 
                  onClick={() => handleCopy(state.lastOutputs.translatedText)}
                  className="p-2 text-muted hover:text-accent transition-colors"
                >
                  {isCopied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                </button>
                <button
                  onClick={() => handleNativeShare(state.lastOutputs.translatedText, 'Translated Text')}
                  className="p-2 text-muted hover:text-accent transition-colors"
                >
                  <Share2 size={18} />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-[100px] text-lg leading-relaxed text-text-main whitespace-pre-wrap">
          {state.lastOutputs.translatedText ? (
            <div className="markdown-body">
              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{state.lastOutputs.translatedText}</Markdown>
            </div>
          ) : (
            <span className="text-muted/40 italic">{t('translationPlaceholder')}</span>
          )}
        </div>
        {state.lastOutputs.translatedText && isCached && (
          <div className="flex justify-end">
            <span className="text-[10px] uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">{t('instant')}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
