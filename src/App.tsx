import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import 'katex/dist/katex.min.css';
import { 
  Download,
  AlertCircle,
  X
} from 'lucide-react';
import { storage } from './services/storage';
import { AIService } from './services/ai';
import { validateSecurity } from './utils/security';
import { applyTheme, resolveTheme, watchSystemThemeChanges } from './utils/theme';
import { generateHash } from './utils/hash';
import { copyTextToClipboard } from './utils/clipboard';
import { safeLocalStorage } from './utils/safeStorage';
import { translations } from './i18n';
import { SplashScreen } from './components/SplashScreen';
import { useSpeechToText } from './hooks/useSpeechToText';
import { useTextToSpeech } from './hooks/useTextToSpeech';
import { VoiceModal } from './components/common/VoiceModal';
import { 
  VocabItem, 
  AppState, 
  Language, 
  Audience, 
  Tone, 
  Length,
  Format,
  ConversationContext,
  HistoryItem
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
import { InstallBanner } from './components/InstallBanner';
import { ChangelogModal } from './components/ChangelogModal';
import { FloatingAssistant } from './components/FloatingAssistant';
import { APP_VERSION } from './config/version';
import { TranslateTab } from './components/TranslateTab';
import { ComposeTab } from './components/ComposeTab';
import { useTabNavigation } from './hooks/useTabNavigation';
import { useTranslateTab } from './hooks/useTranslateTab';


const VocabManager = lazy(() => import('./components/VocabManager').then(module => ({ default: module.VocabManager })));
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then(module => ({ default: module.SettingsPanel })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const TalkTab = lazy(() => import('./components/TalkTab').then(module => ({ default: module.TalkTab })));
const HistoryTab = lazy(() => import('./components/HistoryTab').then(module => ({ default: module.HistoryTab })));

// --- Main App ---

export default function App() {
  const { activeTab, setActiveTab } = useTabNavigation();
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [isVocabOpen, setIsVocabOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);

  const requestTimestamps = useRef<number[]>([]);
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(true);
  const [isIosPromptVisible, setIsIosPromptVisible] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [useContextInCompose, setUseContextInCompose] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  
  useEffect(() => {
    const lastSeenVersion = safeLocalStorage.getItem('app_last_seen_version');
    if (lastSeenVersion !== APP_VERSION) {
      setIsChangelogOpen(true);
      safeLocalStorage.setItem('app_last_seen_version', APP_VERSION);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'talk') {
      const SERVER_BASE_URL = import.meta.env.VITE_RENDER_SERVER_URL || import.meta.env.VITE_API_URL || '';
      fetch(`${SERVER_BASE_URL}/api/realtime/session`, { method: 'OPTIONS' })
        .catch(() => { /* Ignore pre-warming error */ });
    }
  }, [activeTab]);

  useEffect(() => {
    fetch('/api/security-rules')
      .then(res => res.json())
      .then(data => {
        if (data && data.pattern_text) {
          safeLocalStorage.setItem('aima_block_pattern', data.pattern_text);
        }
      })
      .catch(console.error);
  }, []);


  // Tab States
  const [composeReq, setComposeReq] = useState('');
  const [activePresetId, setActivePresetId] = useState('custom');
  const [composeParams, setComposeParams] = useState({
    audience: 'cross_dept' as Audience,
    tone: 'professional' as Tone,
    length: 'standard' as Length,
    lang: 'English' as Language,
    format: 'wechat_zalo' as Format
  });


  const checkRateLimit = useCallback(() => {
    return true; // Rate limiting removed
  }, []);

  const [reviewToggle, setReviewToggle] = useState<'reply' | 'summary'>('reply');

  const { isListening, transcript, interimTranscript, error: speechError, startListening, stopListening, setTranscript } = useSpeechToText();
  const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech();

  const composeCacheRef = useRef<Map<string, string>>(new Map());

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

  const {
    translateInput,
    setTranslateInput,
    translateImage,
    setTranslateImage,
    targetLang,
    setTargetLang,
    speechLang,
    setSpeechLang,
    isSummaryMode,
    setIsSummaryMode,
    isTranslating,
    isCached,
    matchedTerms,
    getVocabTranslation,
    handleTranslate,
    triggerDebouncedAutoTranslate,
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

  // Input states with interim transcript for word counting
  const tInterim = isListening && interimTranscript ? interimTranscript : '';
  const composeInputWithInterim = composeReq + (activeTab === 'compose' && tInterim ? (composeReq && !composeReq.endsWith(' ') ? ' ' : '') + tInterim : '');

  const getWordCount = (text: string) => text.trim().split(/\s+/).filter(word => word.length > 0).length;
  const translateWordCount = getWordCount(translateInputWithInterim);
  const composeWordCount = getWordCount(composeInputWithInterim);

  const saveToLocalHistory = useCallback(async (type: 'translate' | 'compose') => {
    try {
      if (type === 'translate') {
        const text = translateInput.trim();
        const result = state.lastOutputs.translatedText;
        if (!text || !result) return;

        const historyList = await storage.getHistory();
        const exists = historyList.some(h => h.type === 'translate' && h.input === text && h.output === result);
        if (!exists) {
          await storage.addHistory({
            type: 'translate',
            input: text,
            output: result,
            toLang: targetLang
          });
        }
      } else if (type === 'compose') {
        const req = composeReq.trim();
        const result = state.lastOutputs.generatedReply;
        if (!req || !result) return;

        const historyList = await storage.getHistory();
        const exists = historyList.some(h => h.type === 'compose' && h.input === req && h.output === result);
        if (!exists) {
          await storage.addHistory({
            type: 'compose',
            input: req,
            output: result,
            toLang: composeParams.lang,
            meta: {
              tone: composeParams.tone,
              format: composeParams.format
            }
          });
        }
      }
    } catch (err) {
      console.error('Failed to save to local history:', err);
    }
  }, [translateInput, state.lastOutputs, targetLang, composeReq, composeParams]);

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
  }, [transcript, setTranscript, activeTab, setTranslateInput]);

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
    const isIos = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod/.test(userAgent);
    };
    const isInStandaloneMode = () => ('standalone' in window.navigator) && (window.navigator as any).standalone;
    
    if (isIos() && !isInStandaloneMode()) {
      setIsIosPromptVisible(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Web Share Target API handler
  useEffect(() => {
    const handleShareTarget = () => {
      const url = new URL(window.location.href);
      if (url.pathname === '/share-handler' || url.searchParams.has('text')) {
        const title = url.searchParams.get('title') || '';
        const text = url.searchParams.get('text') || '';
        const sharedUrl = url.searchParams.get('url') || '';
        
        const sharedContent = [title, text, sharedUrl].filter(Boolean).join('\n');
        
        if (sharedContent) {
          setTranslateInput(sharedContent);
          setActiveTab('translate');
          
          // Clear URL to prevent re-triggering
          window.history.replaceState({}, document.title, '/');
        }
      }
    };
    
    handleShareTarget();
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallBanner(false);
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

  const handleCompose = useCallback(async () => {
    stopSpeaking();
    const currentContext = useContextInCompose ? context : null;
    const hasContext = currentContext && (currentContext.sourceText || currentContext.translatedText);

    if (!composeReq.trim() && !hasContext) {
      showToast(t('provideRequirements'), 'error');
      return;
    }

    if (!checkRateLimit()) return;

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
      await storage.addHistory({ 
        type: 'compose', 
        input: composeReq, 
        output: result,
        toLang: composeParams.lang,
        meta: {
          tone: composeParams.tone,
          format: composeParams.format
        }
      });
      showToast(t('replyGenerated'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [composeReq, composeParams, context, useContextInCompose, state.settings, state.lastOutputs, state.structuredSummary, vocab, handleExtract, t, showToast]);

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

  const handleClearHistory = useCallback(async () => {
    try {
      await storage.clearHistory();
      showToast(t('historyCleared') || 'History cleared successfully', 'success');
    } catch (err: any) {
      showToast('Failed to clear history: ' + err.message, 'error');
    }
  }, [showToast, t]);

  const handleReuse = useCallback((item: HistoryItem) => {
    if (activeTab === 'translate') {
      saveToLocalHistory('translate');
    } else if (activeTab === 'compose') {
      saveToLocalHistory('compose');
    }
    if (item.type === 'translate') {
      setTranslateInput(item.input);
      if (item.toLang) setTargetLang(item.toLang as Language);
      setActiveTab('translate');
    } else if (item.type === 'compose') {
      setComposeReq(item.input);
      if (item.meta) {
        setComposeParams(prev => ({
          ...prev,
          tone: (item.meta?.tone as Tone) || prev.tone,
          format: (item.meta?.format as Format) || prev.format,
          lang: (item.toLang as Language) || prev.lang
        }));
      } else if (item.toLang) {
        setComposeParams(prev => ({ ...prev, lang: item.toLang as Language }));
      }
      setActiveTab('compose');
    } else if (item.type === 'talk') {
      setActiveTab('talk');
    }
  }, [activeTab, saveToLocalHistory]);

  const handleCopy = useCallback(async (text: string) => {
    if (!text) return;
    const success = await copyTextToClipboard(text);
    if (success) {
      setIsCopied(true);
      saveToLocalHistory('translate');
      showToast(t('copiedToClipboard'), 'success');
      setTimeout(() => setIsCopied(false), 2000);
    } else {
      showToast(t('copyFailed') || 'Failed to copy', 'error');
    }
  }, [showToast, t, saveToLocalHistory]);

  const copyToClipboard = useCallback(async (text: string) => {
    const success = await copyTextToClipboard(text);
    if (success) {
      saveToLocalHistory('compose');
      showToast(t('copiedToClipboard'), 'success');
    } else {
      showToast(t('copyFailed') || 'Failed to copy', 'error');
    }
  }, [showToast, t, saveToLocalHistory]);

  return (
    <>




      <ChangelogModal 
        isOpen={isChangelogOpen} 
        onClose={() => setIsChangelogOpen(false)} 
      />
      
      <FloatingAssistant settings={state.settings} vocab={vocab} />
      
      <AnimatePresence>
        {showInstallBanner && (
          <InstallBanner 
            deferredPrompt={deferredPrompt}
            onInstall={handleInstallPWA}
            onClose={() => setShowInstallBanner(false)}
            isIosPromptVisible={isIosPromptVisible}
          />
        )}
      </AnimatePresence>
      
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
      <div className="flex-1 overflow-y-auto pb-24">
        {activeTab === 'translate' && (
          <TranslateTab
            translateInput={translateInput}
            setTranslateInput={setTranslateInput}
            translateImage={translateImage}
            setTranslateImage={setTranslateImage}
            targetLang={targetLang}
            setTargetLang={setTargetLang}
            isSummaryMode={isSummaryMode}
            setIsSummaryMode={setIsSummaryMode}
            translateInputWithInterim={translateInputWithInterim}
            matchedTerms={matchedTerms}
            getVocabTranslation={getVocabTranslation}
            handleTranslate={handleTranslate}
            loading={loading}
            isTranslating={isTranslating}
            isStreaming={isStreaming}
            isListening={isListening}
            handleClearInput={handleClearInput}
            handleImageUpload={handleImageUpload}
            handlePaste={handlePaste}
            handlePasteFromClipboard={handlePasteFromClipboard}
            handleToggleListening={handleToggleListening}
            handleSpeak={handleSpeak}
            handleCopy={handleCopy}
            triggerDebouncedAutoTranslate={triggerDebouncedAutoTranslate}
            state={state}
            isSpeaking={isSpeaking}
            isCopied={isCopied}
            isCached={isCached}
            t={t}
          />
        )}

        {activeTab === 'compose' && (
          <ComposeTab
            composeReq={composeReq}
            setComposeReq={setComposeReq}
            activePresetId={activePresetId}
            setActivePresetId={setActivePresetId}
            composeParams={composeParams}
            setComposeParams={setComposeParams}
            useContextInCompose={useContextInCompose}
            setUseContextInCompose={setUseContextInCompose}
            context={context}
            isListening={isListening}
            composeInputWithInterim={composeInputWithInterim}
            state={state}
            isSpeaking={isSpeaking}
            loading={loading}
            handleCompose={handleCompose}
            handleToggleListening={handleToggleListening}
            handleSpeak={handleSpeak}
            copyToClipboard={copyToClipboard}
            t={t}
          />
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
          <Suspense fallback={<FallbackSpinner />}>
            <TalkTab settings={state.settings} vocab={vocab} t={t} showToast={showToast} />
          </Suspense>
        )}

        {activeTab === 'history' && (
          <motion.div 
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="h-full overflow-y-auto"
          >
            <Suspense fallback={<FallbackSpinner />}>
              <HistoryTab t={t} showToast={showToast} onReuse={handleReuse} />
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
                onClearHistory={handleClearHistory}
                settings={state.settings}
                onSaveSettings={(s) => {
                  storage.setSettings(s);
                  setState(prev => ({ ...prev, settings: s }));
                }}
                t={t}
                onOpenAdmin={() => setIsAdminMode(true)}
              />
            </Suspense>
          </motion.div>
        )}
      </div>

      <VoiceModal 
        isOpen={isListening} 
        textListening={t('listeningActive')} 
        onClick={handleToggleListening}
      />

      <AnimatePresence>
        {isAdminMode && (
          <Suspense fallback={<FallbackSpinner />}>
            <AdminDashboard onClose={() => setIsAdminMode(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </Layout>
    </>
  );
}
