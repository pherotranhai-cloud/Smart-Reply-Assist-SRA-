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
import { processOcrOffline } from './utils/ocr';
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
  GlobalLanguage,
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
import { TemporaryLockoutModal } from './components/TemporaryLockoutModal';
import { PermanentBanOverlay } from './components/PermanentBanOverlay';

const VocabManager = lazy(() => import('./components/VocabManager').then(module => ({ default: module.VocabManager })));
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then(module => ({ default: module.SettingsPanel })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const TalkTab = lazy(() => import('./components/TalkTab').then(module => ({ default: module.TalkTab })));
const HistoryTab = lazy(() => import('./components/HistoryTab').then(module => ({ default: module.HistoryTab })));

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'translate' | 'compose' | 'talk' | 'vocab' | 'history' | 'settings'>('translate');
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
  const [isLocked, setIsLocked] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [showLockout, setShowLockout] = useState(false);
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(true);
  const [isIosPromptVisible, setIsIosPromptVisible] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [useContextInCompose, setUseContextInCompose] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  
  useEffect(() => {
    const lastSeenVersion = localStorage.getItem('app_last_seen_version');
    if (lastSeenVersion !== APP_VERSION) {
      setIsChangelogOpen(true);
      localStorage.setItem('app_last_seen_version', APP_VERSION);
    }
  }, []);

  useEffect(() => {
    fetch('/api/security-rules')
      .then(res => res.json())
      .then(data => {
        if (data && data.pattern_text) {
          localStorage.setItem('aima_block_pattern', data.pattern_text);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    // Generate or retrieve device_uuid
    let deviceUuid = localStorage.getItem('aima_device_uuid');
    if (!deviceUuid) {
      deviceUuid = crypto.randomUUID ? crypto.randomUUID() : 'uuid-' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('aima_device_uuid', deviceUuid);
    }

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        let [resource, config] = args;
        
        config = config || {};
        config.headers = {
          ...config.headers,
          'x-device-uuid': deviceUuid
        };

        // Inject device_uuid into JSON payloads
        if (config.method && ['POST', 'PUT', 'PATCH'].includes(config.method.toUpperCase())) {
           if (typeof config.body === 'string') {
             try {
                const parsedBody = JSON.parse(config.body);
                if (typeof parsedBody === 'object' && parsedBody !== null) {
                   parsedBody.device_uuid = deviceUuid;
                   config.body = JSON.stringify(parsedBody);
                }
             } catch (e) {
                // Ignore parse errors if body is not JSON
             }
           }
        }

        const response = await originalFetch(resource, config);
        if (response.status === 403) {
          setIsBanned(true);
        }
        return response;
      } catch (e) {
        throw e;
      }
    };

    let axiosInterceptor: number | null = null;
    import('axios').then(({ default: axios }) => {
      axiosInterceptor = axios.interceptors.request.use((config) => {
        if (!config.headers) {
          config.headers = {} as any;
        }
        config.headers['x-device-uuid'] = deviceUuid;
        if (config.data && typeof config.data === 'object') {
          config.data.device_uuid = deviceUuid;
        }
        return config;
      });
      
      const responseInterceptor = axios.interceptors.response.use(
        response => response,
        error => {
          if (error.response && error.response.status === 403) {
            setIsBanned(true);
          }
          return Promise.reject(error);
        }
      );
    }).catch(console.error);

    fetch('/api/health').catch(console.error);

    return () => {
      window.fetch = originalFetch;
      // ... cleanup if needed
    };
  }, []);

  const outputRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab States
  const [translateInput, setTranslateInput] = useState('');
  const [translateImage, setTranslateImage] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState<Language>('Vietnamese');
  const [speechLang, setSpeechLang] = useState<string>('vi-VN');
  const [isSummaryMode, setIsSummaryMode] = useState(false);
  
  const [composeReq, setComposeReq] = useState('');
  const [activePresetId, setActivePresetId] = useState('custom');
  const [composeParams, setComposeParams] = useState({
    audience: 'cross_dept' as Audience,
    tone: 'professional' as Tone,
    length: 'standard' as Length,
    lang: 'English' as Language,
    format: 'wechat_zalo' as Format
  });

  const handleCloseLockout = useCallback(() => {
    setShowLockout(false);
    setIsLocked(false);
    requestTimestamps.current = [];
  }, []);

  const checkRateLimit = useCallback(() => {
    const now = Date.now();
    requestTimestamps.current = requestTimestamps.current.filter(t => now - t < 30000);
    if (requestTimestamps.current.length >= 5) {
      if (!isLocked) {
        setIsLocked(true);
        setShowLockout(true);
        
        fetch('/api/security-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: translateInput || composeReq })
        }).catch(e => console.error(e));
      }
      return false;
    }
    requestTimestamps.current.push(now);
    return true;
  }, [isLocked, translateInput, composeReq]);

  const [reviewToggle, setReviewToggle] = useState<'reply' | 'summary'>('reply');

  const { isListening, transcript, interimTranscript, error: speechError, startListening, stopListening, setTranscript } = useSpeechToText();
  const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech();

  const composeCacheRef = useRef<Map<string, string>>(new Map());
  const lastAutoTranslatedInput = useRef("");

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
    if (activeTab === 'talk') {
      setActiveTab('translate');
    }
  }, [activeTab]);

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

  const getVocabTranslation = useCallback((item: VocabItem, lang: Language) => {
    switch (lang) {
      case 'Vietnamese': return item.vi;
      case 'English': return item.en;
      case 'Chinese (Simplified)': return item.zh_cn;
      case 'Chinese (Traditional)': return item.zh_tw;
      case 'Indonesian': return item.id_lang;
      case 'Burmese': return item.my;
      default: return item.vi || item.en;
    }
  }, []);

  const getDetectedGlossaryTerms = useCallback(() => {
    if (!translateInput.trim() || !vocab || vocab.length === 0) return [];
    const lowerInput = translateInput.toLowerCase();
    
    return vocab.filter(item => {
      if (item.enabled === false || item.enabled === 'false') return false;
      const termLower = item.term?.toLowerCase();
      if (!termLower || termLower.length < 2) return false;
      
      try {
        const escapedTerm = termLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const isAlphanumeric = /^[a-zA-Z0-9\s]+$/.test(termLower);
        if (isAlphanumeric) {
          const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i');
          return regex.test(lowerInput);
        } else {
          return lowerInput.includes(termLower);
        }
      } catch (e) {
        return lowerInput.includes(termLower);
      }
    });
  }, [translateInput, vocab]);

  const matchedTerms = getDetectedGlossaryTerms();

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

  const handleTranslate = useCallback(async (isAuto = false) => {
    stopSpeaking();
    if (!translateInput && !translateImage) {
      if (!isAuto) showToast(t('provideTextOrImage'), 'error');
      return;
    }

    if (!isAuto && !checkRateLimit()) return;

    const securityCheck = validateSecurity(translateInput);
    if (!securityCheck.isValid) {
      if (!isAuto) showToast(t(securityCheck.errorKey || 'SECURITY_FIREWALL_ERROR'), 'error');
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

    if (!isAuto && cache[hashKey]) {
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
      lastAutoTranslatedInput.current = translateInput.trim();
      return;
    }

    try {
      setIsCached(false);
      setLoading(true); // Ensure loading is set
      
      const ai = new AIService(state.settings);
      
      let finalSourceText = translateInput;

      if (translateImage) {
        if (!isAuto) showToast('Đang nhận diện chữ trong ảnh (Offline)...', 'info');
        const extractedText = await processOcrOffline(translateImage);
        
        if (translateInput.trim()) {
          finalSourceText = `${translateInput}\n\n--- [Image Content] ---\n${extractedText}`;
        } else {
          finalSourceText = extractedText;
        }
        if (!isAuto) showToast('Đang dịch thuật văn bản chuyên ngành...', 'info');
      }
      
      // Reset translated text for typewriter effect
      setState(prev => ({ 
        ...prev, 
        lastOutputs: { ...prev.lastOutputs, translatedText: '' } 
      }));

      let fullTranslation = '';
      
      // Pre-filter glossary terms for better prompt injection
      const matchedTerms = getDetectedGlossaryTerms();
      const injectedVocab = matchedTerms.length > 0 ? matchedTerms : currentVocab;

      let hasReceivedFirstChunk = false;
      setIsStreaming(true);

      const result = await ai.translate(finalSourceText, targetLang, injectedVocab, !!translateImage, isSummaryMode, (chunk) => {
        if (!hasReceivedFirstChunk && chunk.trim()) {
          hasReceivedFirstChunk = true;
          setLoading(false);
        }
        fullTranslation += chunk;
        setState(prev => ({ 
          ...prev, 
          lastOutputs: { ...prev.lastOutputs, translatedText: fullTranslation } 
        }));
      }, isAuto);
      
      setIsStreaming(false);
      
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

      const historyItemToSave = {
        type: 'translate' as const,
        input: finalSourceText,
        output: result,
        toLang: targetLang,
        id: '',
        timestamp: Date.now()
      };

      if (!isAuto) {
        await storage.addHistory(historyItemToSave);
      }
      
      // Save to cache
      cache[hashKey] = { translatedText: result, timestamp: Date.now() };
      await storage.setTranslationCache(cache);
      
      if (!isAuto) showToast(t('translationUpdated'), 'success');
      lastAutoTranslatedInput.current = translateInput.trim();
    } catch (err: any) {
      if (!isAuto) showToast(err.message, 'error');
    } finally {
      setLoading(false);
      setIsStreaming(false);
    }
  }, [translateInput, translateImage, targetLang, state.settings, state.lastOutputs, t, showToast, getDetectedGlossaryTerms, isSummaryMode]);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!translateInput.trim() || translateInput.trim().length < 3) {
      return;
    }

    if (isListening) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const currentLength = translateInput.trim().length;
      const lastLength = lastAutoTranslatedInput.current.length;
      
      // Nếu người dùng xóa bớt chữ hoặc gõ thêm ít hơn 20 ký tự so với lần dịch tự động gần nhất, lập tức dừng lại
      if (currentLength - lastLength < 20) {
        return;
      }
      handleTranslate(true);
    }, 2000);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [translateInput, targetLang, isListening, handleTranslate]);

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

  const handleCopy = useCallback((text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    saveToLocalHistory('translate');
    showToast(t('copiedToClipboard'), 'success');
    setTimeout(() => setIsCopied(false), 2000);
  }, [showToast, t, saveToLocalHistory]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    saveToLocalHistory('compose');
    showToast(t('copiedToClipboard'), 'success');
  }, [showToast, t, saveToLocalHistory]);

  return (
    <>
      <TemporaryLockoutModal 
        isOpen={showLockout} 
        onClose={handleCloseLockout} 
      />

      {isBanned && <PermanentBanOverlay />}

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
                  <select 
                    className="ios-select"
                    value={targetLang}
                    onChange={e => setTargetLang(e.target.value as Language)}
                  >
                    {LANGUAGES.map(l => <option key={l} value={l} className="bg-panel">{LANGUAGE_FLAGS[l]} {l}</option>)}
                  </select>
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
                  disabled={loading || isStreaming || (!translateInput.trim() && !translateImage)}
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
                  disabled={loading || (!composeReq.trim() && !(useContextInCompose && context && (context.sourceText || context.translatedText)))}
                  className="saas-button primary-button w-full shadow-lg shadow-accent/20"
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
      </AnimatePresence>

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
