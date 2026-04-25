import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { 
  Languages, 
  PenTool, 
  ClipboardCheck, 
  Copy, 
  Check, 
  Loader2,
  Download,
  AlertCircle,
  X,
  Camera,
  Volume2,
  Square
} from 'lucide-react';
import { storage } from './services/storage';
import { AIService } from './services/ai';
import { validateSecurity } from './utils/security';
import { applyTheme, resolveTheme, watchSystemThemeChanges, ThemeMode } from './utils/theme';
import { generateHash } from './utils/hash';
import { translations } from './i18n';
import { SplashScreen } from './components/SplashScreen';
import { useSpeechToText } from './hooks/useSpeechToText';
import { useTextToSpeech } from './hooks/useTextToSpeech';
import { VoiceVisualizer } from './components/common/VoiceVisualizer';
import { VoiceModal } from './components/common/VoiceModal';
import { PresetGrid } from './components/common/PresetGrid';
import { 
  VocabItem, 
  AISettings, 
  AppState, 
  Language, 
  Audience, 
  Tone, 
  Length,
  Format,
  ConversationContext,
  GlobalLanguage
} from './types';
import { 
  DEFAULT_STATE, 
  LANGUAGES, 
  AUDIENCES, 
  TONES, 
  FORMATS,
  ComposePreset,
  LANGUAGE_FLAGS
} from './constants';

// --- Components ---
import { Layout } from './components/Layout';
import { Skeleton, VocabSkeleton } from './components/Skeleton';
import { FallbackSpinner } from './components/FallbackSpinner';

const VocabManager = lazy(() => import('./components/VocabManager').then(module => ({ default: module.VocabManager })));
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then(module => ({ default: module.SettingsPanel })));
const TalkTab = lazy(() => import('./components/TalkTab').then(module => ({ default: module.TalkTab })));

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'translate' | 'compose' | 'talk' | 'vocab' | 'settings'>('translate');
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [isVocabOpen, setIsVocabOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [useContextInCompose, setUseContextInCompose] = useState(true);
  
  const outputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab States
  const [translateInput, setTranslateInput] = useState('');
  const [translateImage, setTranslateImage] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState<Language>('Vietnamese');
  const [speechLang, setSpeechLang] = useState<string>('vi-VN');
  
  const [composeReq, setComposeReq] = useState('');
  const [activePresetId, setActivePresetId] = useState('custom');
  const [composeParams, setComposeParams] = useState({
    audience: 'cross_dept' as Audience,
    tone: 'professional' as Tone,
    length: 'standard' as Length,
    lang: 'English' as Language,
    format: 'wechat_zalo' as Format
  });

  const [reviewToggle, setReviewToggle] = useState<'reply' | 'summary'>('reply');

  const { isListening, transcript, interimTranscript, error: speechError, startListening, stopListening, setTranscript } = useSpeechToText();
  const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech();

  const composeCacheRef = useRef<Map<string, string>>(new Map());

  // Input states with interim transcript for word counting
  const tInterim = isListening && interimTranscript ? interimTranscript : '';
  const translateInputWithInterim = translateInput + (activeTab === 'translate' && tInterim ? (translateInput && !translateInput.endsWith(' ') ? ' ' : '') + tInterim : '');
  const composeInputWithInterim = composeReq + (activeTab === 'compose' && tInterim ? (composeReq && !composeReq.endsWith(' ') ? ' ' : '') + tInterim : '');

  const getWordCount = (text: string) => text.trim().split(/\s+/).filter(word => word.length > 0).length;
  const translateWordCount = getWordCount(translateInputWithInterim);
  const composeWordCount = getWordCount(composeInputWithInterim);

  const t = useCallback((key: string) => {
    const lang = state.globalLanguage as keyof typeof translations;
    const dict = translations[lang] as any;
    const fallback = translations['en'] as any;
    return dict[key] || fallback[key] || key;
  }, [state.globalLanguage]);

  const showToast = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleToggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening(speechLang);
    }
  }, [isListening, startListening, stopListening, speechLang]);

  const handleSpeak = useCallback((text: string, lang: string) => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      const result = speak(text, lang);
      if (!result.success && result.message) {
        showToast(result.message, 'error');
      }
    }
  }, [isSpeaking, speak, stopSpeaking, showToast]);

  useEffect(() => {
    if (transcript) {
      if (activeTab === 'translate') {
        setTranslateInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript);
      } else if (activeTab === 'compose') {
        setComposeReq(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript);
      }
      setTranscript('');
    }
  }, [transcript, setTranscript, activeTab]);

  useEffect(() => {
    if (isListening) {
      stopListening();
    }
    stopSpeaking();
  }, [activeTab, stopListening, stopSpeaking]);

  useEffect(() => {
    if (speechError) {
      showToast(t(speechError), 'error');
    }
  }, [speechError, t, showToast]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setTranslateImage(event.target?.result as string);
        showToast(t('imageUploaded'), 'success');
      };
      reader.readAsDataURL(file);
    }
  }, [showToast, t]);

  useEffect(() => {
    if (state.lastOutputs.translatedText && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [state.lastOutputs.translatedText]);

  useEffect(() => {
    const langMap: Record<string, string> = {
      'en': 'en-US',
      'vi': 'vi-VN',
      'zh-CN': 'zh-CN',
      'zh-TW': 'zh-TW',
      'id': 'id-ID'
    };
    if (langMap[state.globalLanguage]) {
      setSpeechLang(langMap[state.globalLanguage]);
    }
  }, [state.globalLanguage]);

  useEffect(() => {
    const init = async () => {
      try {
        const [settings, themeMode, lang, localVocab, outputs, ctx, summary] = await Promise.all([
          storage.getSettings(),
          storage.getTheme(),
          storage.getGlobalLanguage(),
          storage.getVocab(),
          storage.getLastOutputs(),
          storage.getContext(),
          storage.getStructuredSummary()
        ]);

        let v = localVocab;

        // Silent Sync on App Launch
        storage.syncWithCloud().then(async (result) => {
          if (result.success) {
            const updatedVocab = await storage.getVocab();
            setVocab(updatedVocab);
          }
        }).catch(console.error);

        setState(prev => ({ 
          ...prev, 
          settings, 
          themeMode, 
          globalLanguage: lang, 
          lastOutputs: outputs, 
          structuredSummary: summary || undefined 
        }));
        setVocab(v);
        setContext(ctx);
        
        // Initial theme application
        const resolved = resolveTheme(themeMode);
        applyTheme(resolved);
      } catch (err) {
        console.error('Hydration failed:', err);
      } finally {
        setHydrated(true);
        setIsAppLoading(false);
      }
    };
    init();
  }, [resetNonce]);

  // System theme watcher
  useEffect(() => {
    if (state.themeMode === 'system') {
      return watchSystemThemeChanges((theme) => {
        applyTheme(theme);
      });
    }
  }, [state.themeMode]);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleExtract = async (text: string, sourceLang: string, contextSource: 'original' | 'translated') => {
    setExtracting(true);
    try {
      const ai = new AIService(state.settings);
      const summary = await ai.extractStructuredSummary(text, sourceLang, contextSource);
      setState(prev => ({ ...prev, structuredSummary: summary }));
      await storage.setStructuredSummary(summary);
      return summary;
    } catch (err: any) {
      showToast(t('extractPrioritiesError'), 'error');
      return null;
    } finally {
      setExtracting(false);
    }
  };

  const handleTranslate = useCallback(async () => {
    stopSpeaking();
    if (!translateInput && !translateImage) {
      showToast(t('provideTextOrImage'), 'error');
      return;
    }

    const securityCheck = validateSecurity(translateInput);
    if (!securityCheck.isValid) {
      showToast(t(securityCheck.errorKey || 'SECURITY_FIREWALL_ERROR'), 'error');
      setLoading(false);
      return;
    }

    setLoading(true);

    // Use local storage directly for instant access
    const currentVocab = await storage.getVocab();
    
    // Hash key: text + lang + (image if exists)
    const imageHash = translateImage ? translateImage.substring(0, 50) + translateImage.substring(translateImage.length - 50) : '';
    const hashKey = generateHash(translateInput + targetLang + imageHash);
    const cache = await storage.getTranslationCache();

    if (cache[hashKey]) {
      // Cache hit
      const cachedResult = cache[hashKey].translatedText;
      // Typewriter effect
      for (let i = 0; i <= cachedResult.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 10)); // 10ms per char
        setState(prev => ({ 
          ...prev, 
          lastOutputs: { ...prev.lastOutputs, translatedText: cachedResult.substring(0, i) } 
        }));
      }
      setIsCached(true);
      showToast(t('instantTranslation'), 'success');
      setLoading(false);
      return;
    }

    try {
      setIsCached(false);
      setLoading(true); // Ensure loading is set
      
      const ai = new AIService(state.settings);
      
      let finalSourceText = translateInput;

      if (translateImage) {
        showToast(t('readingImage'), 'info');
        const extractedText = await ai.extractTextFromImage(translateImage);
        
        if (translateInput.trim()) {
          finalSourceText = `${translateInput}\n\n--- [Image Content] ---\n${extractedText}`;
        } else {
          finalSourceText = extractedText;
        }
        showToast(t('translating'), 'info');
      }
      
      // Reset translated text for typewriter effect
      setState(prev => ({ 
        ...prev, 
        lastOutputs: { ...prev.lastOutputs, translatedText: '' } 
      }));

      let fullTranslation = '';
      
      const result = await ai.translate(finalSourceText, targetLang, currentVocab, undefined, (chunk) => {
        fullTranslation += chunk;
        setState(prev => ({ 
          ...prev, 
          lastOutputs: { ...prev.lastOutputs, translatedText: fullTranslation } 
        }));
      });
      
      const newOutputs = { ...state.lastOutputs, translatedText: result, summary: '', contextSource: 'translated' as const };
      setState(prev => ({ ...prev, lastOutputs: newOutputs }));
      await storage.setLastOutputs(newOutputs);
      
      // Update Conversation Context
      const newContext: ConversationContext = {
        sourceText: finalSourceText,
        translatedText: result,
        summaryText: '',
        targetTranslationLanguage: targetLang,
        lastUpdatedIso: new Date().toISOString(),
        contextSource: 'translated'
      };
      setContext(newContext);
      await storage.setContext(newContext);

      await storage.addHistory({ type: 'translate', input: finalSourceText, output: result });
      
      // Save to cache
      cache[hashKey] = { translatedText: result, timestamp: Date.now() };
      await storage.setTranslationCache(cache);
      
      showToast(t('translationUpdated'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [translateInput, translateImage, targetLang, state.settings, state.lastOutputs, t, showToast]);

  const handleCompose = useCallback(async () => {
    stopSpeaking();
    const currentContext = useContextInCompose ? context : null;
    const hasContext = currentContext && (currentContext.sourceText || currentContext.translatedText);

    if (!composeReq.trim() && !hasContext) {
      showToast(t('provideRequirements'), 'error');
      return;
    }

    const securityCheck = validateSecurity(composeReq);
    if (!securityCheck.isValid) {
      showToast(t(securityCheck.errorKey || 'SECURITY_FIREWALL_ERROR'), 'error');
      setLoading(false);
      return;
    }

    const goal = activePresetId === 'custom' ? 'Custom' : activePresetId.charAt(0).toUpperCase() + activePresetId.slice(1);
    const cacheKey = `${composeReq}-${composeParams.lang}-${composeParams.tone}-${goal}`;

    if (composeCacheRef.current.has(cacheKey)) {
      const cachedResult = composeCacheRef.current.get(cacheKey)!;
      
      let subject = '';
      let body = cachedResult;
      if (composeParams.format === 'formal_email' && cachedResult.toLowerCase().startsWith('subject:')) {
        const lines = cachedResult.split('\n');
        subject = lines[0].replace(/subject:/i, '').trim();
        body = lines.slice(1).join('\n').trim();
      }

      // Typewriter effect
      for (let i = 0; i <= body.length; i += 2) {
        await new Promise(resolve => setTimeout(resolve, 5));
        setState(prev => ({ 
          ...prev, 
          lastOutputs: { ...prev.lastOutputs, generatedReply: body.substring(0, i), subject } 
        }));
      }

      setState(prev => ({ 
        ...prev, 
        lastOutputs: { ...prev.lastOutputs, generatedReply: body, subject }
      }));
      showToast(t('replyGenerated'), 'success');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const ai = new AIService(state.settings);
      
      // Pull context if available and enabled by user
      let contextText = '';
      let currentStructuredSummary = null;

      if (currentContext && (currentContext.sourceText || currentContext.translatedText)) {
        contextText = state.lastOutputs.contextSource === 'original' 
          ? currentContext.sourceText 
          : currentContext.translatedText;
        
        // Check if structured summary is missing or stale
        currentStructuredSummary = state.structuredSummary;
        const isStale = !currentStructuredSummary || 
          new Date(currentContext.lastUpdatedIso) > new Date(currentStructuredSummary.meta.extractedAtIso);
        
        if (isStale) {
          const sourceLang = currentContext.targetTranslationLanguage || 'Auto';
          currentStructuredSummary = await handleExtract(contextText, sourceLang, state.lastOutputs.contextSource || 'translated');
        }
      }

      let fullReply = '';
      
      // Reset generated reply for typewriter effect
      setState(prev => ({ 
        ...prev, 
        lastOutputs: { ...prev.lastOutputs, generatedReply: '', subject: '' } 
      }));

      const result = await ai.compose(
        contextText,
        composeReq, 
        {
          audience: composeParams.audience,
          tone: composeParams.tone,
          length: composeParams.length,
          lang: composeParams.lang,
          format: composeParams.format,
          goal: activePresetId === 'custom' ? 'Custom' : activePresetId.charAt(0).toUpperCase() + activePresetId.slice(1)
        }, 
        vocab,
        currentStructuredSummary || undefined,
        (chunk) => {
          fullReply += chunk;
          
          let subject = '';
          let body = fullReply;
          if (composeParams.format === 'formal_email' && fullReply.toLowerCase().startsWith('subject:')) {
            const lines = fullReply.split('\n');
            subject = lines[0].replace(/subject:/i, '').trim();
            body = lines.slice(1).join('\n').trim();
          }

          setState(prev => ({ 
            ...prev, 
            lastOutputs: { ...prev.lastOutputs, generatedReply: body, subject } 
          }));
        }
      );

      // Final extraction of subject
      let subject = '';
      let body = result;
      if (composeParams.format === 'formal_email' && result.toLowerCase().startsWith('subject:')) {
        const lines = result.split('\n');
        subject = lines[0].replace(/subject:/i, '').trim();
        body = lines.slice(1).join('\n').trim();
      }

      const newOutputs = { 
        ...state.lastOutputs, 
        generatedReply: body, 
        subject
      };
      
      // Save result to cache
      composeCacheRef.current.set(cacheKey, result);

      setState(prev => ({ ...prev, lastOutputs: newOutputs }));
      await storage.setLastOutputs(newOutputs);
      await storage.addHistory({ type: 'compose', input: composeReq, output: result });
      showToast(t('replyGenerated'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [composeReq, composeParams, context, useContextInCompose, state.settings, state.lastOutputs, state.structuredSummary, vocab, handleExtract, t, showToast]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setTranslateImage(event.target?.result as string);
            showToast(t('imagePasted'), 'success');
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  }, [showToast, t]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setTranslateInput(prev => prev + (prev ? '\n' : '') + text);
        showToast(t('textPasted'), 'success');
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      showToast(t('clipboardDenied'), 'error');
    }
  }, [showToast, t]);

  const handleClearInput = useCallback(() => {
    setTranslateInput('');
    setTranslateImage(null);
  }, []);

  const handleReset = async () => {
    if (!window.confirm(t('clearContextConfirm'))) return;
    
    try {
      // 1. Clear Storage
      await storage.clearSessionData();

      // 2. Reset UI State
      setTranslateInput('');
      setTranslateImage(null);
      setComposeReq('');
      setContext(null);
      setLoading(false);
      setReviewToggle('reply');
      setActiveTab('translate');
      setIsContextExpanded(false);
      
      setState(prev => ({
        ...prev,
        lastOutputs: {
          translatedText: '',
          generatedReply: '',
          summary: '',
          contextSource: 'translated',
          subject: '',
        }
      }));

      // 3. Trigger Re-hydration guard
      setResetNonce(prev => prev + 1);
      
      showToast(t('contextCleared'), 'success');
    } catch (err: any) {
      showToast(t('resetFailed') + err.message, 'error');
    }
  };

  const handleCopy = useCallback((text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    showToast(t('copiedToClipboard'), 'success');
    setTimeout(() => setIsCopied(false), 2000);
  }, [showToast, t]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    showToast(t('copiedToClipboard'), 'success');
  }, [showToast, t]);

  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <SplashScreen 
            isDataLoaded={!isAppLoading} 
            onComplete={() => setShowSplash(false)} 
            t={t}
          />
        )}
      </AnimatePresence>

      <Layout
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        toast={toast}
        onCloseToast={() => setToast(null)}
        t={t}
      >
      <AnimatePresence mode="wait">
        {activeTab === 'translate' && (
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
                <h3 className="text-[12px] font-medium tracking-widest text-text-muted uppercase">{t('inputSource')}</h3>
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
                  maxLength={3000}
                />
                <div className="absolute bottom-3 right-3 text-[11px] font-medium" style={{ color: translateWordCount > 500 ? '#ef4444' : '#64748b' }}>
                  {translateWordCount} / 500 words
                </div>
                {isListening && (
                  <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-full animate-pulse">
                    <div className="w-2 h-2 bg-red-500 rounded-full" />
                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">{t('listening')}</span>
                  </div>
                )}
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button 
                    onClick={handleClearInput}
                    className="p-2 glass-panel rounded-xl text-muted hover:text-red-400 transition-colors"
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
                    className="p-2 glass-panel rounded-xl text-muted hover:text-accent transition-colors"
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
                    className="p-2 glass-panel rounded-xl text-muted hover:text-accent transition-colors"
                  >
                    <ClipboardCheck size={18} />
                  </button>
                </div>
              </div>

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
                  <label className="text-[12px] font-medium tracking-widest text-text-muted uppercase">{t('targetLanguage')}</label>
                  <select 
                    className="saas-input w-full"
                    value={targetLang}
                    onChange={e => setTargetLang(e.target.value as Language)}
                  >
                    {LANGUAGES.map(l => <option key={l} value={l} className="bg-panel">{LANGUAGE_FLAGS[l]} {l}</option>)}
                  </select>
                </div>
                <button 
                  onClick={handleTranslate}
                  disabled={loading || (!translateInput.trim() && !translateImage) || translateWordCount > 500}
                  className="saas-button primary-button flex-1 sm:flex-none flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Languages size={20} />}
                  <span>{t('translate')}</span>
                </button>
              </div>
            </div>

            <div ref={outputRef} className="premium-card flex flex-col gap-4 bg-surface/30">
              <div className="flex justify-between items-center">
                <h3 className="text-[12px] font-medium tracking-widest text-text-muted uppercase">{t('translatedOutput')}</h3>
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
        )}

        {activeTab === 'compose' && (
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
                    <label className="text-[13px] font-semibold text-text-main">{t('replyRequirements')}</label>
                  </div>
                  <div className="relative flex-1 flex flex-col">
                    <textarea 
                      className="w-full flex-1 min-h-[30vh] p-4 bg-panel text-text-main border border-border-main rounded-2xl shadow-sm resize-none text-[17px] leading-relaxed focus:ring-2 focus:ring-accent focus:border-transparent outline-none transition-all"
                      placeholder={t('replyPlaceholder')}
                      value={composeInputWithInterim}
                      onChange={e => setComposeReq(e.target.value)}
                      maxLength={3000}
                    />
                    <div className="absolute bottom-3 right-3 text-[11px] font-medium" style={{ color: composeWordCount > 500 ? '#ef4444' : '#64748b' }}>
                      {composeWordCount} / 500 words
                    </div>
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
                          className="p-2 glass-panel rounded-xl text-muted hover:text-red-400 transition-colors"
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
                <div className="premium-card space-y-4 bg-surface/30">
                  <div className="flex justify-between items-center">
                    <h3 className="text-[12px] font-medium tracking-widest text-text-muted uppercase">{t('generatedOutput')}</h3>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleSpeak(state.lastOutputs.generatedReply, composeParams.lang)}
                        className={`p-2 transition-colors ${isSpeaking ? 'text-accent animate-pulse' : 'text-muted hover:text-accent'}`}
                      >
                        {isSpeaking ? <Square size={18} /> : <Volume2 size={18} />}
                      </button>
                      <button 
                        onClick={() => copyToClipboard(state.lastOutputs.generatedReply)}
                        className="p-2 text-muted hover:text-accent transition-colors"
                      >
                        <Copy size={18} />
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
                  disabled={loading || (!composeReq.trim() && !(useContextInCompose && context && (context.sourceText || context.translatedText))) || composeWordCount > 500}
                  className="w-full bg-accent hover:bg-accent/90 disabled:bg-panel disabled:border disabled:border-border-main disabled:text-text-muted text-white rounded-2xl py-4 text-[17px] font-semibold flex items-center justify-center gap-2 shadow-lg shadow-accent/20 transition-all active:scale-[0.98]"
                  style={{ height: '40px' }}
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <PenTool size={20} />}
                  <span>{t('generateReply')}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'vocab' && (
          <motion.div 
            key="vocab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="h-full"
          >
            <div className="premium-card h-full flex flex-col">
              <Suspense fallback={<FallbackSpinner />}>
                <VocabManager t={t} />
              </Suspense>
            </div>
          </motion.div>
        )}

        {activeTab === 'talk' && (
          <motion.div 
            key="talk"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="h-[calc(100vh-120px)]"
          >
            <Suspense fallback={<FallbackSpinner />}>
              <TalkTab settings={state.settings} vocab={vocab} t={t} />
            </Suspense>
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div 
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="h-full overflow-y-auto"
          >
            <Suspense fallback={<FallbackSpinner />}>
              <SettingsPanel 
                themeMode={state.themeMode}
                onThemeChange={(mode) => {
                  storage.setTheme(mode);
                  setState(prev => ({ ...prev, themeMode: mode }));
                  applyTheme(resolveTheme(mode));
                  showToast(t('themeChanged'), 'info');
                }}
                globalLanguage={state.globalLanguage}
                onLanguageChange={async (lang) => {
                  await storage.setGlobalLanguage(lang);
                  setState(prev => ({ ...prev, globalLanguage: lang }));
                  showToast(t('languageChanged'), 'info');
                }}
                onReset={handleReset}
                settings={state.settings}
                onSaveSettings={(s) => {
                  storage.setSettings(s);
                  setState(prev => ({ ...prev, settings: s }));
                }}
                t={t}
              />
            </Suspense>
            
            {deferredPrompt && (
              <div className="px-4 pb-8">
                <button 
                  onClick={handleInstallPWA}
                  className="saas-button primary-button w-full flex items-center justify-center gap-2"
                >
                  <Download size={20} />
                  <span>{t('installPWA')}</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <VoiceModal 
        isOpen={isListening} 
        textListening={t('listeningActive')} 
        onClick={handleToggleListening}
      />
    </Layout>
    </>
  );
}
