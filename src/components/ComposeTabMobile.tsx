import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Loader2, PenTool, AlertCircle, X, Square, Volume2, Copy, Check, Share2 } from 'lucide-react';
import { PresetGrid } from './common/PresetGrid';
import { VoiceVisualizer } from './common/VoiceVisualizer';
import { AppState, ConversationContext, Audience, Tone, Length, Format, Language } from '../types';
import { useComposeTab } from '../hooks/useComposeTab';

interface ComposeTabProps {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  vocab: any[];
  t: (key: string) => string;
  showToast: (message: string, type?: 'info' | 'error' | 'success') => void;
  activeTab: string;
  context: ConversationContext | null;
  checkRateLimit: () => boolean;
  stopSpeaking: () => void;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  handleExtract: (text: string, sourceLang: string, contextSource: 'original' | 'translated') => Promise<any>;
  isListening: boolean;
  interimTranscript: string;
  handleToggleListening: () => void;
  handleSpeak: (text: string, lang: string) => void;
  copyToClipboard: (text: string) => Promise<void>;
  isSpeaking: boolean;
  loading: boolean;
  transcript: string;
  setTranscript: React.Dispatch<React.SetStateAction<string>>;
}

export function ComposeTabMobile({
  state,
  setState,
  vocab,
  t,
  showToast,
  activeTab,
  context,
  checkRateLimit,
  stopSpeaking,
  setLoading,
  handleExtract,
  isListening,
  interimTranscript,
  handleToggleListening,
  handleSpeak,
  copyToClipboard,
  isSpeaking,
  loading,
  transcript,
  setTranscript,
}: ComposeTabProps) {
  const {
    composeReq,
    setComposeReq,
    activePresetId,
    setActivePresetId,
    composeParams,
    setComposeParams,
    useContextInCompose,
    setUseContextInCompose,
    handleCompose,
  } = useComposeTab({
    state,
    setState,
    vocab,
    t,
    showToast,
    activeTab,
    context,
    checkRateLimit,
    stopSpeaking,
    setLoading,
    handleExtract,
  });

  useEffect(() => {
    if (transcript && activeTab === 'compose') {
      setComposeReq(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript);
      setTranscript('');
    }
  }, [transcript, setTranscript, activeTab, setComposeReq]);

  const [isCopied, setIsCopied] = useState(false);
  const tInterim = isListening && interimTranscript ? interimTranscript : '';
  const composeInputWithInterim = composeReq + (activeTab === 'compose' && tInterim ? (composeReq && !composeReq.endsWith(' ') ? ' ' : '') + tInterim : '');

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
        console.log("Người dùng hủy chia sẻ hoặc lỗi:", err);
      }
    } else {
      await handleCopy(text);
    }
  };

  return (
    <motion.div 
      key="compose"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex flex-col h-full relative"
    >
      <div className="flex-1 overflow-y-auto pb-32 space-y-4">
        <div className="premium-card space-y-6">
          
          {/* Context Toggle */}
          <div className="flex justify-center">
            {context ? (
              <button
                onClick={() => setUseContextInCompose(!useContextInCompose)}
                className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-300 border ${
                  useContextInCompose 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                    : 'bg-panel border-border-main text-text-muted hover:text-text-main'
                }`}
              >
                <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${useContextInCompose ? 'bg-emerald-500' : 'bg-text-muted'}`} />
                <span>{useContextInCompose ? t('linkedToContext') : t('independentMode')}</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-panel border border-border-main text-text-muted rounded-full text-[13px] font-medium">
                <AlertCircle size={14} />
                <span>{t('noContext')}</span>
              </div>
            )}
          </div>

          {/* Primary Focus: Reply Requirements */}
          <div className="space-y-2 flex flex-col flex-1">
            <div className="flex justify-between items-center px-1">
              <div className="flex items-center gap-3">
                <label className="text-[13px] font-semibold text-text-main">{t('replyRequirements')}</label>
                <span className="text-[11px] text-slate-400 font-medium">
                  {composeInputWithInterim.length} / 1500
                </span>
              </div>
            </div>
            <div className="relative flex-1 flex flex-col">
              <textarea 
                className="w-full flex-1 min-h-[30vh] p-4 bg-panel text-text-main border-none rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.015)] resize-none text-[17px] leading-relaxed focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all"
                placeholder={t('replyPlaceholder')}
                value={composeInputWithInterim}
                onChange={e => setComposeReq(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCompose();
                  }
                }}
                maxLength={1500}
              />
              {isListening && (
                <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full animate-pulse">
                  <div className="w-2 h-2 bg-red-500 rounded-full" />
                  <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">{t('listeningActive')}</span>
                </div>
              )}
              <div className="absolute bottom-3 right-3 flex gap-2">
                {composeReq && (
                  <button 
                    onClick={() => setComposeReq('')}
                    className="p-2 bg-transparent rounded-xl text-text-muted hover:bg-bg-input active:bg-bg-input hover:text-red-400 transition-colors"
                  >
                    <X size={18} />
                  </button>
                )}
                <VoiceVisualizer
                  isListening={isListening}
                  onClick={handleToggleListening}
                  title={isListening ? t('listeningActive') : t('startVoice')}
                />
              </div>
            </div>
          </div>

          {/* Configuration Grid */}
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
        </div>

        {/* Generated Output */}
        {state.lastOutputs.generatedReply && (
          <div className="premium-card space-y-4 bg-panel">
            <div className="flex justify-between items-center">
              <h3 className="text-[11px] font-medium tracking-widest text-slate-400 uppercase">{t('generatedOutput')}</h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleSpeak(state.lastOutputs.generatedReply, composeParams.lang)}
                  className={`p-2 transition-colors ${isSpeaking ? 'text-accent animate-pulse' : 'text-muted hover:text-accent'}`}
                >
                  {isSpeaking ? <Square size={18} /> : <Volume2 size={18} />}
                </button>
                <button 
                  onClick={() => handleCopy(state.lastOutputs.generatedReply)}
                  className="p-2 text-muted hover:text-accent transition-colors"
                >
                  {isCopied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                </button>
                <button
                  onClick={() => handleNativeShare(state.lastOutputs.generatedReply, 'Generated Reply')}
                  className="p-2 text-muted hover:text-accent transition-colors"
                >
                  <Share2 size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-[100px] text-base leading-relaxed text-text-main whitespace-pre-wrap">
              {state.lastOutputs.subject && (
                <div className="mb-4 pb-4 border-b border-border-main/50">
                  <span className="text-[11px] text-accent uppercase font-medium block mb-1 tracking-widest">{t('subject')}</span>
                  <div className="text-text-main font-bold">{state.lastOutputs.subject}</div>
                </div>
              )}
              <div className="markdown-body">
                <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{state.lastOutputs.generatedReply}</Markdown>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sticky Action Button */}
      <div className="fixed bottom-[90px] left-0 right-0 p-4 bg-gradient-to-t from-app via-app/80 to-transparent pointer-events-none z-40">
        <div className="max-w-3xl mx-auto pointer-events-auto">
          <button 
            onClick={handleCompose}
            disabled={loading || (!composeReq.trim() && !(useContextInCompose && context && (context.sourceText || context.translatedText)))}
            className="saas-button primary-button w-full shadow-lg shadow-accent/20"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : <PenTool size={20} />}
            <span>{t('generateReply')}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
