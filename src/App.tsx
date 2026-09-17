import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { motion, AnimatePresence, MotionConfig, useReducedMotion, type Variants } from 'motion/react';
import 'katex/dist/katex.min.css';
import { storage } from './services/storage';
import { AIService } from './services/ai';
import { resolveUiTheme, isDarkPalette, watchSystemThemeChanges } from './utils/theme';
import { copyFormattedText } from './utils/clipboard';
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
import { InstallBanner } from './components/InstallBanner';
import { ChangelogModal } from './components/ChangelogModal';
import { FloatingAssistant } from './components/FloatingAssistant';
import { UPDATE_CHANGELOG } from './config/version';
import { TranslateTab } from './components/TranslateTab';
import { ComposeTab } from './components/ComposeTab';
// Vocab, Talk, History, Settings and the admin dashboard used to be React.lazy()
// chunks, fetched the first time their tab was opened. That download landed in
// the middle of the swipe that asked for the tab, so the page animated in over a
// spinner and settled late. Every screen is part of the one bundle now: the app
// is paid for once, at startup, behind the splash screen, and a tab switch is
// only a render.
import { VocabManager } from './components/VocabManager';
import { TalkTab } from './components/TalkTab';
import { HistoryTab } from './components/HistoryTab';
import { SettingsPanel } from './components/SettingsPanel';
import { AdminDashboard } from './components/AdminDashboard';
import { useTabNavigation, TAB_ORDER, type TabType } from './hooks/useTabNavigation';
import { useTranslateTab } from './hooks/useTranslateTab';
import { useComposeTab } from './hooks/useComposeTab';
import { usePresenceHeartbeat } from './hooks/usePresenceHeartbeat';

// Where a page waits while another one is showing: on the side it sits on in
// TAB_ORDER - the same array the swipe gesture walks, imported rather than
// copied so the two cannot drift. A page below the active tab rests to the
// left, one above it rests to the right, so moving forward brings the next page
// in from the right and moving back brings the previous one in from the left
// (iOS push/pop), without anything having to remember which way the last move
// went. Both navs list the tabs in this order; the desktop sidebar used to have
// vocab and history the other way round, which made that one pair read as a
// back gesture there.
const ASIDE_OFFSET = 28;

// `offset` arrives through `custom`: -28 for a page to the left, 28 to the right.
// For the page that is showing it is the side it arrived from, which only its
// first mount ever uses.
const tabVariants: Variants = {
  aside: (offset: number) => ({
    opacity: 0,
    x: offset,
    transition: { duration: 0.13, ease: 'easeIn' },
  }),
  center: {
    opacity: 1,
    x: 0,
    // restDelta stops the spring from trailing a fraction of a pixel for the
    // best part of a second: while a page still holds a transform it is the
    // containing block for any `position: fixed` child of the tab, such as
    // Compose's action bar.
    transition: {
      x: { type: 'spring', stiffness: 400, damping: 34, mass: 0.7, restDelta: 0.5 },
      opacity: { duration: 0.18 },
    },
  },
};

const reducedTabVariants: Variants = {
  aside: { opacity: 0, transition: { duration: 0.08 } },
  center: { opacity: 1, transition: { duration: 0.12 } },
};

// One page of the pager.
//
// A page is mounted the first time its tab is opened and then stays mounted for
// the rest of the session. While another tab is showing it is `display: none`,
// which keeps its React state, its scroll position and its DOM while costing
// nothing to lay out or paint - and takes any `position: fixed` child of the
// tab with it. Coming back is a style flip and a spring, not a fresh mount that
// re-runs every effect and re-reads storage.
//
// A page that is already mounted animates from wherever it was parked to the
// centre, so it needs no `initial` at all. A page mounting for the first time
// has nowhere to come from, and `initial="aside"` is what gives that first
// visit the same arrival as every one after it. The page the app opens on is
// the exception: it has not been navigated to, so it starts at the centre.
function TabPage({ active, offset, enterOnMount, reducedMotion, className, children }: {
  active: boolean;
  offset: number;
  enterOnMount: boolean;
  reducedMotion: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      custom={offset}
      variants={reducedMotion ? reducedTabVariants : tabVariants}
      initial={enterOnMount ? 'aside' : false}
      animate={active ? 'center' : 'aside'}
      className={`${active ? '' : 'hidden '}${className ?? ''}`}
      aria-hidden={!active}
    >
      {children}
    </motion.div>
  );
}

// --- Main App ---

export default function App() {
  // Nhịp heartbeat cho chỉ số "số người online" của Admin Dashboard
  usePresenceHeartbeat();

  const { activeTab, setActiveTab } = useTabNavigation();
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  // The key the server accepted at unlock, kept for the dashboard's requests.
  // Session-scoped React state on purpose: it is never persisted, so closing
  // the tab ends the admin session and nothing is left on disk to be found.
  const [adminKey, setAdminKey] = useState<string | null>(null);

  const [context, setContext] = useState<ConversationContext | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(true);
  const [isIosPromptVisible, setIsIosPromptVisible] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  /** Bumped by handleClearHistory so the History tab re-reads storage. */
  const [historyVersion, setHistoryVersion] = useState(0);
  const { preferences: userPreferences, setPreferences: setUserPreferences } = useUserPreferences();

  const prefersReducedMotion = useReducedMotion();

  // Which tabs exist in the DOM. A tab joins the set the first time it is
  // opened and never leaves it, so the first visit pays for the mount and every
  // visit after that is a style flip. Recorded while rendering rather than in an
  // effect: the page has to be in the tree on the same commit that shows it, or
  // the tab would flash empty for a frame.
  const [mountedTabs, setMountedTabs] = useState<Set<TabType>>(() => new Set([activeTab]));
  if (!mountedTabs.has(activeTab)) {
    setMountedTabs(prev => new Set(prev).add(activeTab));
  }

  /** The tab the app opened on: the one page that should not animate in. */
  const [startupTab] = useState(activeTab);

  // Which way the last tab change went, derived while rendering and then frozen
  // until the next one. Only a page's very first mount needs it — a page that
  // is already mounted comes back from the side it is parked on, which its
  // place in TAB_ORDER decides. It cannot be computed in an effect: a mounting
  // page reads `custom` on the same commit that adds it to the tree, and an
  // effect would not have run yet.
  const [lastMove, setLastMove] = useState({ tab: activeTab, direction: 1 });
  if (lastMove.tab !== activeTab) {
    setLastMove({
      tab: activeTab,
      direction: TAB_ORDER.indexOf(activeTab) < TAB_ORDER.indexOf(lastMove.tab) ? -1 : 1,
    });
  }

  const activeTabIndex = TAB_ORDER.indexOf(activeTab);
  const tabPage = (tab: TabType) => ({
    active: activeTab === tab,
    // A page that is showing keeps the side it arrived from; a page that is not
    // waits on the side it sits on in TAB_ORDER, ready to come back from there.
    offset:
      activeTab === tab
        ? lastMove.direction * ASIDE_OFFSET
        : TAB_ORDER.indexOf(tab) < activeTabIndex
          ? -ASIDE_OFFSET
          : ASIDE_OFFSET,
    enterOnMount: tab !== startupTab,
    reducedMotion: !!prefersReducedMotion,
  });
  
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
        const [settings, lang, localVocab, outputs, ctx, summary] = await Promise.all([
          storage.getSettings(),
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

  // Both destructive actions are confirmed by the Settings action sheet
  // (SystemSection) before they get here, so they no longer prompt themselves —
  // a second, native window.confirm on top of the sheet would be two dialogs.
  const handleResetApp = useCallback(() => {
    try {
      localStorage.clear();
    } catch (err) {
      console.error('LocalStorage clear error:', err);
    }
    window.location.reload();
  }, []);

  const handleClearHistory = useCallback(async () => {
    try {
      await storage.clearHistory();
      // The History tab owns its own copy of the list and stays mounted behind
      // Settings, so clearing storage cannot reach it. This is what tells it to
      // re-read.
      setHistoryVersion(v => v + 1);
      showToast(t('historyCleared'), 'success');
    } catch (err: any) {
      showToast('Failed to clear history: ' + err.message, 'error');
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

  // Every copy button goes through the user's chosen format, so the Markdown
  // the model writes never reaches a chat box that would show it literally.
  const copyFormat = userPreferences.copyFormat ?? 'plain';

  const handleCopy = useCallback(async (text: string) => {
    if (!text) return;
    const success = await copyFormattedText(text, copyFormat);
    if (success) {
      setIsCopied(true);
      showToast(t('copiedToClipboard'), 'success');
      setTimeout(() => setIsCopied(false), 2000);
    } else {
      showToast(t('copyFailed'), 'error');
    }
  }, [showToast, t, copyFormat]);

  const copyToClipboard = useCallback(async (text: string) => {
    const success = await copyFormattedText(text, copyFormat);
    if (success) {
      showToast(t('copiedToClipboard'), 'success');
    } else {
      showToast(t('copyFailed'), 'error');
    }
  }, [showToast, t, copyFormat]);

  return (
    // reducedMotion="user" hands the OS setting to every motion component in the
    // app: the CSS media query alone does not reach JS-driven springs.
    <MotionConfig reducedMotion="user">
    <>
      <BackgroundCanvas preferences={userPreferences} />

      <ChangelogModal 
        isOpen={isChangelogOpen} 
        onClose={() => setIsChangelogOpen(false)} 
      />
      
      <FloatingAssistant settings={state.settings} vocab={vocab} copyFormat={copyFormat} />
      
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
      {/* The pages slide sideways, and overflow-y-auto on its own computes the
          other axis to auto - which would let the slide scroll sideways. clip,
          not hidden, so the container never gains a stray scroll position. */}
      <div className="flex-1 overflow-y-auto overflow-x-clip pb-24">
        {mountedTabs.has('translate') && (
          <TabPage key="translate" {...tabPage('translate')}>
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
          </TabPage>
        )}

        {mountedTabs.has('compose') && (
          <TabPage key="compose" {...tabPage('compose')} className="h-full">
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
          </TabPage>
        )}

        {mountedTabs.has('vocab') && (
          <TabPage key="vocab" {...tabPage('vocab')} className="h-full">
            <div className="premium-card h-full flex flex-col">
              <VocabManager t={t} userPreferences={userPreferences} />
            </div>
          </TabPage>
        )}

        {mountedTabs.has('talk') && (
          <TabPage key="talk" {...tabPage('talk')} className="h-full">
            <TalkTab settings={state.settings} vocab={vocab} t={t} showToast={showToast} userPreferences={userPreferences} isActive={activeTab === 'talk'} />
          </TabPage>
        )}

        {mountedTabs.has('history') && (
          <TabPage key="history" {...tabPage('history')} className="h-full overflow-y-auto">
            <HistoryTab t={t} showToast={showToast} onReuse={handleReuse} userPreferences={userPreferences} historyVersion={historyVersion} isActive={activeTab === 'history'} />
          </TabPage>
        )}

        {mountedTabs.has('settings') && (
          <TabPage key="settings" {...tabPage('settings')} className="h-full overflow-y-auto">
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
              onOpenAdmin={(key) => setAdminKey(key)}
              userPreferences={userPreferences}
              onUserPreferencesChange={(prefs) => {
                setUserPreferences(prefs);
              }}
            />
          </TabPage>
        )}
      </div>

      <VoiceModal 
        isOpen={isListening} 
        textListening={t('listeningActive')} 
        onClick={handleToggleListening}
      />

      <AnimatePresence>
        {adminKey && (
          <AdminDashboard adminKey={adminKey} onClose={() => setAdminKey(null)} />
        )}
      </AnimatePresence>
    </Layout>
    </>
    </MotionConfig>
  );
}
