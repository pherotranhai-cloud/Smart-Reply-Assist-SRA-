import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import 'katex/dist/katex.min.css';
import { storage } from './services/storage';
import { AIService } from './services/ai';
import { resolveUiTheme, isDarkPalette, watchSystemThemeChanges } from './utils/theme';
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
  ConversationContext,
  HistoryItem,
  Language,
  Tone,
  Format
} from './types';
import { DEFAULT_STATE, LANGUAGES } from './constants';

// --- Components ---
import { Layout } from './components/Layout';
import { BackgroundCanvas } from './components/BackgroundCanvas';
import { useUserPreferences } from './hooks/useUserPreferences';
import { FallbackSpinner } from './components/FallbackSpinner';
import { InstallBanner } from './components/InstallBanner';
import { ChangelogModal } from './components/ChangelogModal';
import { FloatingAssistant } from './components/FloatingAssistant';
import { UPDATE_CHANGELOG } from './config/version';
import { TranslateTab } from './components/TranslateTab';
import { ComposeTab } from './components/ComposeTab';
import { useTabNavigation } from './hooks/useTabNavigation';
import { useTranslateTab } from './hooks/useTranslateTab';
import { useComposeTab } from './hooks/useComposeTab';

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
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);

  const [context, setContext] = useState<ConversationContext | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(true);
  const [isIosPromptVisible, setIsIosPromptVisible] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const { preferences: userPreferences, setPreferences: setUserPreferences } = useUserPreferences();
  
  // Keyed to the release-notes version, not APP_VERSION: the latter is bumped
  // by the pre-commit hook on every commit, which would show this modal to
  // every user on every deploy.
  useEffect(() => {
    const lastSeen = safeLocalStorage.getItem('app_last_seen_version');
    if (lastSeen !== UPDATE_CHANGELOG.version) {
      setIsChangelogOpen(true);
      safeLocalStorage.setItem('app_last_seen_version', UPDATE_CHANGELOG.version);
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


  const { isListening, transcript, interimTranscript, error: speechError, startListening, stopListening, setTranscript } = useSpeechToText();
  const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech();

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
      const langMap: Record<string, string> = {
        'en': 'en-US',
        'vi': 'vi-VN',
        'zh-CN': 'zh-CN',
        'zh-TW': 'zh-TW',
        'id': 'id-ID'
      };
      startListening(langMap[state.globalLanguage] || 'vi-VN');
    }
  }, [isListening, startListening, stopListening, state.globalLanguage]);

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

      } catch (err) {
        console.error('Hydration failed:', err);
      } finally {
        setIsAppLoading(false);
      }
    };
    init();
  }, []);

  // Apply Personalization variables dynamically
  useEffect(() => {
    if (userPreferences) {
      // Single owner of data-theme. 'system' resolves to the OS light/dark
      // preference; the named palettes pass through as themselves.
      const resolved = resolveUiTheme(userPreferences.theme);
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.classList.toggle('dark', isDarkPalette(resolved));

      // Handle custom fonts
      document.documentElement.classList.remove('font-custom-sans', 'font-custom-mono', 'font-custom-serif', 'font-custom-fancy');
      let fontClass = 'font-custom-sans';
      if (userPreferences.fontFamily === 'mono') fontClass = 'font-custom-mono';
      else if (userPreferences.fontFamily === 'serif') fontClass = 'font-custom-serif';
      else if (userPreferences.fontFamily === 'playfair') fontClass = 'font-custom-fancy';
      document.documentElement.classList.add(fontClass);

      // Handle custom font sizes
      document.documentElement.classList.remove('text-sm', 'text-base', 'text-lg', 'text-xl');
      let sizeClass = 'text-base';
      if (userPreferences.fontSize === 'sm') sizeClass = 'text-sm';
      else if (userPreferences.fontSize === 'lg') sizeClass = 'text-lg';
      else if (userPreferences.fontSize === 'xl') sizeClass = 'text-xl';
      document.documentElement.classList.add(sizeClass);

      // Set background opacity/blur for glassmorphism
      if (userPreferences.backgroundImage) {
        document.documentElement.style.setProperty('--app-bg-opacity', '0.4');
        document.documentElement.style.setProperty('--app-blur-intensity', '12px');
      } else {
        document.documentElement.style.setProperty('--app-bg-opacity', '1');
        document.documentElement.style.setProperty('--app-blur-intensity', '0px');
      }
    }
  }, [userPreferences]);

  // Repaint when the OS flips light/dark, but only while following it.
  useEffect(() => {
    if (userPreferences.theme && userPreferences.theme !== 'system') return;
    return watchSystemThemeChanges((theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.classList.toggle('dark', isDarkPalette(theme));
    });
  }, [userPreferences.theme]);

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
          window.sessionStorage.setItem('shared_translate_input', sharedContent);
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
    try {
      const ai = new AIService(state.settings);
      const summary = await ai.extractStructuredSummary(text, sourceLang, contextSource);
      setState(prev => ({ ...prev, structuredSummary: summary }));
      await storage.setStructuredSummary(summary);
      return summary;
    } catch (err: any) {
      showToast(t('extractPrioritiesError'), 'error');
      return null;
    }
  };


  // Translate/Compose state lives here, not inside the tab components.
  // App stays mounted for the whole session, so switching tabs or crossing the
  // desktop breakpoint (which swaps <TabMobile/> for <TabDesktop/>) no longer
  // discards whatever the user had typed.
  const translateTab = useTranslateTab({
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
    setIsStreaming,
    transcript,
    setTranscript,
  });

  const composeTab = useComposeTab({
    state,
    setState,
    vocab,
    t,
    showToast,
    activeTab,
    context,
    stopSpeaking,
    setLoading,
    handleExtract,
    transcript,
    setTranscript,
  });

  const handleResetApp = useCallback(() => {
    if (window.confirm(t('confirmResetApp') || 'Bạn có chắc chắn muốn đặt lại toàn bộ ứng dụng không? Mọi cài đặt và dữ liệu sẽ bị xóa sạch.')) {
      try {
        localStorage.clear();
      } catch (err) {
        console.error('LocalStorage clear error:', err);
      }
      window.location.reload();
    }
  }, [t]);

  const handleClearHistory = useCallback(async () => {
    if (window.confirm(t('confirmClearHistory') || 'Bạn có chắc chắn muốn xóa toàn bộ lịch sử dịch thuật không?')) {
      try {
        await storage.clearHistory();
        showToast(t('historyCleared') || 'Lịch sử dịch thuật đã được xóa sạch.', 'success');
      } catch (err: any) {
        showToast('Failed to clear history: ' + err.message, 'error');
      }
    }
  }, [showToast, t]);

  // Sends a history entry back to the tab that produced it, restoring the input,
  // its parameters and the previous result. 'talk' entries are transcripts of a
  // translation session, so they reopen in Translate alongside 'translate' ones.
  const handleReuse = useCallback((item: HistoryItem) => {
    if (item.type === 'compose') {
      composeTab.setComposeReq(item.input);
      composeTab.setComposeParams(prev => ({
        ...prev,
        ...(item.meta?.tone ? { tone: item.meta.tone as Tone } : {}),
        ...(item.meta?.format ? { format: item.meta.format as Format } : {}),
        ...(item.toLang && LANGUAGES.includes(item.toLang) ? { lang: item.toLang as Language } : {})
      }));
      setState(prev => ({
        ...prev,
        lastOutputs: { ...prev.lastOutputs, generatedReply: item.output, subject: '' }
      }));
      setActiveTab('compose');
    } else {
      translateTab.setTranslateInput(item.input);
      translateTab.setTranslateImage(null);
      if (item.toLang && LANGUAGES.includes(item.toLang)) {
        translateTab.setTargetLang(item.toLang as Language);
      }
      setState(prev => ({
        ...prev,
        lastOutputs: { ...prev.lastOutputs, translatedText: item.output }
      }));
      setActiveTab('translate');
    }
    showToast(t('reuseLoaded'), 'success');
  }, [composeTab, translateTab, setActiveTab, showToast, t]);

  const handleCopy = useCallback(async (text: string) => {
    if (!text) return;
    const success = await copyTextToClipboard(text);
    if (success) {
      setIsCopied(true);
      showToast(t('copiedToClipboard'), 'success');
      setTimeout(() => setIsCopied(false), 2000);
    } else {
      showToast(t('copyFailed') || 'Failed to copy', 'error');
    }
  }, [showToast, t]);

  const copyToClipboard = useCallback(async (text: string) => {
    const success = await copyTextToClipboard(text);
    if (success) {
      showToast(t('copiedToClipboard'), 'success');
    } else {
      showToast(t('copyFailed') || 'Failed to copy', 'error');
    }
  }, [showToast, t]);

  return (
    <>
      <BackgroundCanvas preferences={userPreferences} />

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
        userPreferences={userPreferences}
      >
      <div className="flex-1 overflow-y-auto pb-24">
        {activeTab === 'translate' && (
          <TranslateTab
            translate={translateTab}
            state={state}
            setState={setState}
            vocab={vocab}
            t={t}
            showToast={showToast}
            isListening={isListening}
            interimTranscript={interimTranscript}
            activeTab={activeTab}
            setContext={setContext}
            stopSpeaking={stopSpeaking}
            setLoading={setLoading}
            isStreaming={isStreaming}
            setIsStreaming={setIsStreaming}
            handleToggleListening={handleToggleListening}
            handleSpeak={handleSpeak}
            handleCopy={handleCopy}
            isSpeaking={isSpeaking}
            isCopied={isCopied}
            loading={loading}
            transcript={transcript}
            setTranscript={setTranscript}
            userPreferences={userPreferences}
          />
        )}

        {activeTab === 'compose' && (
          <ComposeTab
            compose={composeTab}
            state={state}
            setState={setState}
            vocab={vocab}
            t={t}
            showToast={showToast}
            activeTab={activeTab}
            context={context}
            stopSpeaking={stopSpeaking}
            setLoading={setLoading}
            handleExtract={handleExtract}
            isListening={isListening}
            interimTranscript={interimTranscript}
            handleToggleListening={handleToggleListening}
            handleSpeak={handleSpeak}
            copyToClipboard={copyToClipboard}
            isSpeaking={isSpeaking}
            loading={loading}
            transcript={transcript}
            setTranscript={setTranscript}
            userPreferences={userPreferences}
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
                <VocabManager t={t} userPreferences={userPreferences} />
              </Suspense>
            </div>
          </motion.div>
        )}

        {activeTab === 'talk' && (
          <Suspense fallback={<FallbackSpinner />}>
            <TalkTab settings={state.settings} vocab={vocab} t={t} showToast={showToast} userPreferences={userPreferences} />
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
              <HistoryTab t={t} showToast={showToast} onReuse={handleReuse} userPreferences={userPreferences} />
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
                globalLanguage={state.globalLanguage}
                onLanguageChange={async (lang) => {
                  await storage.setGlobalLanguage(lang);
                  setState(prev => ({ ...prev, globalLanguage: lang }));
                  showToast(t('languageChanged'), 'info');
                }}
                handleResetApp={handleResetApp}
                handleClearHistory={handleClearHistory}
                settings={state.settings}
                onSaveSettings={(s) => {
                  storage.setSettings(s);
                  setState(prev => ({ ...prev, settings: s }));
                }}
                t={t}
                onOpenAdmin={() => setIsAdminMode(true)}
                userPreferences={userPreferences}
                onUserPreferencesChange={(prefs) => {
                  setUserPreferences(prefs);
                }}
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
