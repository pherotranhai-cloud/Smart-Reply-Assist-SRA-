import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Languages, 
  PenTool, 
  ClipboardCheck, 
  Settings, 
  Moon, 
  Sun, 
  Copy, 
  Check, 
  Loader2,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Monitor
} from 'lucide-react';
import { storage } from './services/storage';
import { AIService } from './services/ai';
import { normalizeGeminiModelName } from './services/geminiProvider';
import { applyTheme, resolveTheme, watchSystemThemeChanges, ThemeMode } from './utils/theme';
import { RUNTIME, IS_EXTENSION, IS_PWA } from './runtime/env';
import { aiTransport } from './runtime/aiTransport';
import { windowAdapter } from './runtime/window';
import { FileAnalyzer } from './components/FileAnalyzer';
import { translations } from './i18n';
import { 
  VocabItem, 
  AISettings, 
  AppState, 
  Language, 
  Audience, 
  Tone, 
  Format,
  ConversationContext,
  GlobalLanguage
} from './types';
import { 
  DEFAULT_STATE, 
  LANGUAGES, 
  AUDIENCES, 
  TONES, 
  FORMATS 
} from './constants';

// --- Components ---
import { Layout } from './components/Layout';
import { Skeleton, VocabSkeleton } from './components/Skeleton';
import { VocabManager } from './components/VocabManager';
import { SettingsPanel } from './components/SettingsPanel';

const Toast = ({ message, type = 'info', onClose }: { message: string, type?: 'info' | 'error' | 'success', onClose: () => void }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 20 }}
    className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg z-[100] flex items-center gap-2 border backdrop-blur-md ${
      type === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-500' : 
      type === 'success' ? 'bg-green-500/20 border-green-500/50 text-green-500' :
      'bg-blue-500/20 border-blue-500/50 text-blue-400'
    }`}
  >
    {type === 'error' && <AlertCircle size={16} />}
    <span>{message}</span>
    <button onClick={onClose} className="ml-2 hover:opacity-70"><X size={14} /></button>
  </motion.div>
);

const AISettingsPanel = ({ settings, onSave, onTest, t }: { settings: AISettings; onSave: (s: AISettings) => void; onTest: () => Promise<boolean>; t: any }) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string }[]>([]);
  const [manualMode, setManualMode] = useState(false);

  const handleRefreshModels = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await aiTransport.call('LIST_MODELS', localSettings);
      if (response.models) {
        setAvailableModels(response.models);
        // If current model is empty, auto-select first
        if (!localSettings[localSettings.activeProvider].model && response.models.length > 0) {
          updateCurrent({ model: response.models[0].id });
        }
      }
      setTestResult('success');
    } catch (err) {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  const activeProvider = localSettings.activeProvider;
  const current = localSettings[activeProvider];

  const updateCurrent = (updates: Partial<typeof current>) => {
    setLocalSettings({
      ...localSettings,
      [activeProvider]: { ...current, ...updates }
    });
  };

  return (
    <div className="space-y-4 p-4 glass-panel border border-border-main/50">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-accent flex items-center gap-2">
          <Settings size={20} /> {t('aiEngineConfig')}
        </h3>
        <div className="flex p-1 bg-surface rounded-lg border border-border-main/50">
          <button 
            onClick={() => {
              setLocalSettings({ ...localSettings, activeProvider: 'openai' });
              setAvailableModels([]);
            }}
            className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${activeProvider === 'openai' ? 'bg-accent text-white' : 'text-muted'}`}
          >
            OpenAI
          </button>
          <button 
            onClick={() => {
              setLocalSettings({ ...localSettings, activeProvider: 'gemini' });
              setAvailableModels([]);
            }}
            className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${activeProvider === 'gemini' ? 'bg-accent text-white' : 'text-muted'}`}
          >
            Gemini
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-xs text-muted uppercase tracking-wider">{t('modelName')}</label>
            <button 
              onClick={handleRefreshModels}
              disabled={testing}
              className="text-[10px] text-accent hover:underline flex items-center gap-1"
            >
              {testing ? <Loader2 className="animate-spin" size={10} /> : <Check size={10} />} {t('refreshModels')}
            </button>
          </div>
          
          {!manualMode && availableModels.length > 0 ? (
            <select 
              className="saas-input w-full"
              value={current.model}
              onChange={e => updateCurrent({ model: e.target.value })}
            >
              <option value="">{t('selectModel')}</option>
              {availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ) : (
            <input 
              type="text" 
              className="saas-input w-full"
              value={current.model}
              onChange={e => updateCurrent({ model: e.target.value })}
              placeholder={activeProvider === 'openai' ? 'e.g. gpt-4o' : 'e.g. models/gemini-1.5-flash'}
            />
          )}
          
          <div className="flex justify-end">
            <button 
              onClick={() => setManualMode(!manualMode)}
              className="text-[10px] text-muted hover:text-text-main underline mt-1"
            >
              {manualMode ? t('useDropdown') : t('manualOverride')}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted uppercase tracking-wider">{t('apiKey')}</label>
          <input 
            type="password" 
            className="saas-input w-full"
            value={current.apiKey}
            onChange={e => updateCurrent({ apiKey: e.target.value })}
            placeholder={activeProvider === 'openai' ? 'sk-...' : 'Gemini API Key'}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs text-muted uppercase tracking-wider">{t('baseUrl')}</label>
          <input 
            type="text" 
            className="saas-input w-full"
            value={current.baseUrl}
            onChange={e => updateCurrent({ baseUrl: e.target.value })}
            placeholder={activeProvider === 'openai' ? 'https://api.openai.com/v1' : 'https://generativelanguage.googleapis.com'}
          />
        </div>
      </div>

      <div className="flex justify-between items-center pt-2">
        <div className="flex items-center gap-2">
          <button 
            onClick={async () => {
              setTesting(true);
              setTestResult(null);
              const ai = new AIService(localSettings);
              const success = await ai.testConnection();
              setTestResult(success ? 'success' : 'error');
              setTesting(false);
            }}
            disabled={testing}
            className="saas-button secondary-button px-4 py-2 flex items-center gap-2 text-sm"
          >
            {testing ? <Loader2 className="animate-spin" size={16} /> : t('testConnection')}
          </button>
          {testResult === 'success' && <span className="text-green-500 text-sm flex items-center gap-1 font-medium"><Check size={14} /> {t('connected')}</span>}
          {testResult === 'error' && <span className="text-red-500 text-sm flex items-center gap-1 font-medium"><AlertCircle size={14} /> {t('failed')}</span>}
        </div>
        <button 
          onClick={() => onSave(localSettings)}
          className="saas-button primary-button px-6 py-2"
        >
          {t('saveSettings')}
        </button>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'translate' | 'compose' | 'vocab' | 'settings'>('translate');
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [isVocabOpen, setIsVocabOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [showFileAnalyzer, setShowFileAnalyzer] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isCopied, setIsCopied] = useState(false);
  
  const outputRef = useRef<HTMLDivElement>(null);

  // Tab States
  const [translateInput, setTranslateInput] = useState('');
  const [translateImage, setTranslateImage] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState<Language>('Vietnamese');
  
  const [composeReq, setComposeReq] = useState('');
  const [composeParams, setComposeParams] = useState({
    audience: 'Internal-Team' as Audience,
    tone: 'Professional' as Tone,
    lang: 'English' as Language,
    format: 'Email' as Format
  });

  const [reviewToggle, setReviewToggle] = useState<'reply' | 'summary'>('reply');

  useEffect(() => {
    if (state.lastOutputs.translatedText && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [state.lastOutputs.translatedText]);

  const t = (key: keyof typeof translations['en']) => {
    return translations[state.globalLanguage][key] || translations['en'][key] || key;
  };

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
        try {
          const response = await fetch('/api/vocab');
          if (response.ok) {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const data = await response.json();
              if (Array.isArray(data) && data.length > 0) {
                v = data;
                storage.setVocab(data);
              }
            } else {
              console.warn('Expected JSON from /api/vocab on init but received non-JSON response');
            }
          }
        } catch (err) {
          console.error('Failed to fetch vocab from backend on init:', err);
        }

        // Migration: Normalize Gemini model name
        let migrated = false;
        const geminiModel = settings.gemini.model || '';
        
        // Detect label-like values (contains spaces or starts with "Gemini")
        if (geminiModel.includes(' ') || geminiModel.startsWith('Gemini')) {
          settings.gemini.model = ''; // Unset
          migrated = true;
          showToast('Gemini model list refreshed. Please select a model again.', 'info');
        } else if (geminiModel) {
          try {
            const normalized = normalizeGeminiModelName(geminiModel);
            if (normalized && normalized !== geminiModel) {
              settings.gemini.model = normalized;
              migrated = true;
            }
          } catch (e) {
            // Ignore
          }
        }

        if (migrated) {
          await storage.setSettings(settings);
        }

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
        // Artificial delay for splash screen feel
        setTimeout(() => setIsAppLoading(false), 1500);
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

  const showToast = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
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
      showToast('Could not extract priorities; reply will use raw context.', 'error');
      return null;
    } finally {
      setExtracting(false);
    }
  };

  const handleTranslate = async () => {
    if (!translateInput && !translateImage) {
      showToast('Please provide text or an image', 'error');
      return;
    }
    setLoading(true);

    // Defensive vocabulary fetching with graceful fallback
    let currentVocab: VocabItem[] = [];
    try {
      const response = await fetch('/api/vocab');
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          if (Array.isArray(data)) {
            currentVocab = data;
            setVocab(data);
            storage.setVocab(data);
          }
        } else {
          console.warn('Expected JSON from /api/vocab during translate but received non-JSON response');
        }
      } else {
        console.warn(`Vocabulary fetch failed with status: ${response.status}. Falling back to empty list.`);
      }
    } catch (err) {
      console.error('Graceful fallback: Failed to fetch vocabulary list:', err);
      // Continue with empty array as requested
    }

    try {
      const ai = new AIService(state.settings);
      const result = await ai.translate(translateInput, targetLang, currentVocab, translateImage || undefined);
      
      // Generate summary of the input/translation
      const summary = await ai.summarize(translateInput);

      const newOutputs = { ...state.lastOutputs, translatedText: result, summary, contextSource: 'translated' as const };
      setState(prev => ({ ...prev, lastOutputs: newOutputs }));
      await storage.setLastOutputs(newOutputs);
      
      // Update Conversation Context
      const newContext: ConversationContext = {
        sourceText: translateInput,
        translatedText: result,
        summaryText: summary,
        targetTranslationLanguage: targetLang,
        lastUpdatedIso: new Date().toISOString(),
        contextSource: 'translated'
      };
      setContext(newContext);
      await storage.setContext(newContext);

      await storage.addHistory({ type: 'translate', input: translateInput, output: result });
      showToast('Translation & Context updated', 'success');

      // Trigger EPE Extraction (Silent)
      handleExtract(result, targetLang, 'translated');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCompose = async () => {
    if (!composeReq.trim()) {
      showToast('Please provide requirements', 'error');
      return;
    }

    setLoading(true);
    try {
      const ai = new AIService(state.settings);
      
      // Pull context if available
      const currentContext = context;
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

      const result = await ai.compose(
        contextText,
        composeReq, 
        {
          audience: composeParams.audience,
          tone: composeParams.tone,
          lang: composeParams.lang,
          format: composeParams.format
        }, 
        vocab,
        currentStructuredSummary || undefined
      );

      // Extract subject if format is Email
      let subject = '';
      let body = result;
      if (composeParams.format === 'Email' && result.toLowerCase().startsWith('subject:')) {
        const lines = result.split('\n');
        subject = lines[0].replace(/subject:/i, '').trim();
        body = lines.slice(1).join('\n').trim();
      }

      const newOutputs = { 
        ...state.lastOutputs, 
        generatedReply: body, 
        subject
      };
      setState(prev => ({ ...prev, lastOutputs: newOutputs }));
      await storage.setLastOutputs(newOutputs);
      await storage.addHistory({ type: 'compose', input: composeReq, output: result });
      showToast('Reply generated', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setTranslateImage(event.target?.result as string);
            showToast('Image pasted from clipboard', 'success');
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setTranslateInput(prev => prev + (prev ? '\n' : '') + text);
        showToast('Text pasted from clipboard', 'success');
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      showToast('Clipboard access denied', 'error');
    }
  };

  const handleClearInput = () => {
    setTranslateInput('');
    setTranslateImage(null);
  };

  const handleReset = async () => {
    if (!window.confirm(t('clearContextConfirm'))) return;
    
    try {
      // 1. Clear Storage
      await storage.clearSessionData();
      
      // 2. Clear Background Cache (if extension)
      if (IS_EXTENSION) {
        await aiTransport.call('RESET_SESSION', state.settings).catch(() => {});
      }

      // 3. Reset UI State
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

      // 4. Trigger Re-hydration guard
      setResetNonce(prev => prev + 1);
      
      showToast('All context and outputs cleared', 'success');
    } catch (err: any) {
      showToast('Reset failed: ' + err.message, 'error');
    }
  };

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    showToast('Copied to clipboard', 'success');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', 'success');
  };

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      isLoading={isAppLoading}
      toast={toast}
      onCloseToast={() => setToast(null)}
    >
      <AnimatePresence mode="wait">
        {activeTab === 'translate' && (
          <motion.div 
            key="translate"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="premium-card p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-muted uppercase tracking-widest">{t('inputSource')}</h3>
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
                  value={translateInput}
                  onChange={e => setTranslateInput(e.target.value)}
                  onPaste={handlePaste}
                />
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button 
                    onClick={handleClearInput}
                    className="p-2 glass-panel rounded-xl text-muted hover:text-red-400 transition-colors"
                  >
                    <X size={18} />
                  </button>
                  <button 
                    onClick={() => setShowFileAnalyzer(!showFileAnalyzer)}
                    className={`p-2 glass-panel rounded-xl transition-colors ${showFileAnalyzer ? 'text-accent border-accent/50' : 'text-muted hover:text-accent'}`}
                    title="Upload & Analyze File"
                  >
                    <Upload size={18} />
                  </button>
                  <button 
                    onClick={handlePasteFromClipboard}
                    className="p-2 glass-panel rounded-xl text-muted hover:text-accent transition-colors"
                  >
                    <ClipboardCheck size={18} />
                  </button>
                </div>
              </div>

              {showFileAnalyzer && (
                <div className="premium-card p-0 overflow-hidden border-accent/30">
                  <div className="bg-accent/10 p-4 flex justify-between items-center border-b border-white/5">
                    <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                      <Upload size={14} /> {t('analyzeDocument')}
                    </h3>
                    <button onClick={() => setShowFileAnalyzer(false)} className="text-white/30 hover:text-white">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="p-6">
                    <FileAnalyzer 
                      settings={state.settings}
                      globalLanguage={state.globalLanguage}
                      onAnalyzeComplete={(summary) => {
                        if (activeTab === 'translate') {
                          setTranslateInput(summary);
                        } else {
                          setComposeReq(summary);
                        }
                        setShowFileAnalyzer(false);
                        showToast('Context updated from file', 'success');
                      }}
                      t={t}
                    />
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
                  <label className="text-[10px] text-muted uppercase font-bold tracking-wider">{t('targetLanguage')}</label>
                  <select 
                    className="saas-input w-full"
                    value={targetLang}
                    onChange={e => setTargetLang(e.target.value as Language)}
                  >
                    {LANGUAGES.map(l => <option key={l} className="bg-slate-900">{l}</option>)}
                  </select>
                </div>
                <button 
                  onClick={handleTranslate}
                  disabled={loading || !translateInput.trim()}
                  className="saas-button primary-button flex-1 sm:flex-none flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Languages size={20} />}
                  <span>{t('translate')}</span>
                </button>
              </div>
            </div>

            <div ref={outputRef} className="premium-card p-8 flex flex-col gap-4 bg-surface/30">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-muted uppercase tracking-widest">{t('translatedOutput')}</h3>
                {state.lastOutputs.translatedText && (
                  <button 
                    onClick={() => handleCopy(state.lastOutputs.translatedText)}
                    className="p-2 text-muted hover:text-accent transition-colors"
                  >
                    {isCopied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-[100px] text-lg leading-relaxed text-text-main whitespace-pre-wrap">
                {state.lastOutputs.translatedText || <span className="text-muted/40 italic">{t('translationPlaceholder')}</span>}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'compose' && (
          <motion.div 
            key="compose"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="premium-card p-6 space-y-6">
              {/* Context Preview */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-muted uppercase tracking-widest">{t('messageContext')}</h3>
                    {context ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold uppercase tracking-wider">
                        <CheckCircle2 size={12} /> {t('linked')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-amber-500 font-bold uppercase tracking-wider">
                        <AlertCircle size={12} /> {t('noLinked')}
                      </span>
                    )}
                  </div>
                  <div className="flex p-1 glass-panel rounded-full text-[10px] font-bold">
                    <button 
                      onClick={() => {
                        const newOutputs = { ...state.lastOutputs, contextSource: 'translated' as const };
                        setState(prev => ({ ...prev, lastOutputs: newOutputs }));
                        storage.setLastOutputs(newOutputs);
                      }}
                      className={`px-3 py-1 rounded-full transition-all ${state.lastOutputs.contextSource === 'translated' ? 'bg-accent text-white shadow-lg' : 'text-muted hover:text-text-main'}`}
                    >
                      {t('translate')}
                    </button>
                    <button 
                      onClick={() => {
                        const newOutputs = { ...state.lastOutputs, contextSource: 'original' as const };
                        setState(prev => ({ ...prev, lastOutputs: newOutputs }));
                        storage.setLastOutputs(newOutputs);
                      }}
                      className={`px-3 py-1 rounded-full transition-all ${state.lastOutputs.contextSource === 'original' ? 'bg-accent text-white shadow-lg' : 'text-muted hover:text-text-main'}`}
                    >
                      {t('source')}
                    </button>
                  </div>
                </div>
                <div className="relative glass-panel rounded-2xl p-4 bg-surface/30">
                  <div className={`text-sm leading-relaxed text-text-main/80 overflow-hidden transition-all ${isContextExpanded ? 'max-h-[500px] overflow-auto' : 'max-h-20'}`}>
                    {context ? (
                      state.lastOutputs.contextSource === 'original' ? context.sourceText : context.translatedText
                    ) : (
                      <span className="text-muted/40 italic">{t('noContext')}</span>
                    )}
                  </div>
                  {context && (
                    <button 
                      onClick={() => setIsContextExpanded(!isContextExpanded)}
                      className="w-full mt-3 flex items-center justify-center gap-1 text-[10px] font-bold text-accent uppercase tracking-widest border-t border-border-main/50 pt-3"
                    >
                      {isContextExpanded ? <><ChevronUp size={14} /> {t('showLess')}</> : <><ChevronDown size={14} /> {t('expandContext')}</>}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-muted uppercase font-bold tracking-wider">{t('audience')}</label>
                  <select 
                    className="saas-input w-full"
                    value={composeParams.audience}
                    onChange={e => setComposeParams({ ...composeParams, audience: e.target.value as Audience })}
                  >
                    {AUDIENCES.map(a => <option key={a} className="bg-surface">{a}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-muted uppercase font-bold tracking-wider">{t('tone')}</label>
                  <select 
                    className="saas-input w-full"
                    value={composeParams.tone}
                    onChange={e => setComposeParams({ ...composeParams, tone: e.target.value as Tone })}
                  >
                    {TONES.map(t => <option key={t} className="bg-surface">{t}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-muted uppercase font-bold tracking-wider">{t('language')}</label>
                  <select 
                    className="saas-input w-full"
                    value={composeParams.lang}
                    onChange={e => setComposeParams({ ...composeParams, lang: e.target.value as Language })}
                  >
                    {LANGUAGES.filter(l => l !== 'Auto').map(l => <option key={l} className="bg-surface">{l}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-muted uppercase font-bold tracking-wider">{t('format')}</label>
                  <select 
                    className="saas-input w-full"
                    value={composeParams.format}
                    onChange={e => setComposeParams({ ...composeParams, format: e.target.value as Format })}
                  >
                    {FORMATS.map(f => <option key={f} className="bg-surface">{f}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] text-muted uppercase font-bold tracking-wider">{t('replyRequirements')}</label>
                  <button 
                    onClick={() => setShowFileAnalyzer(!showFileAnalyzer)}
                    className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${showFileAnalyzer ? 'text-accent' : 'text-muted hover:text-accent'}`}
                  >
                    <Upload size={12} /> {t('analyzeDocument')}
                  </button>
                </div>
                <textarea 
                  className="saas-input w-full h-32 resize-none text-sm"
                  placeholder={t('replyPlaceholder')}
                  value={composeReq}
                  onChange={e => setComposeReq(e.target.value)}
                />
              </div>

              {showFileAnalyzer && (
                <div className="premium-card p-0 overflow-hidden border-accent/30">
                  <div className="bg-accent/10 p-4 flex justify-between items-center border-b border-border-main">
                    <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-text-main">
                      <Upload size={14} /> {t('analyzeDocument')}
                    </h3>
                    <button onClick={() => setShowFileAnalyzer(false)} className="text-muted hover:text-text-main">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="p-6">
                    <FileAnalyzer 
                      settings={state.settings}
                      globalLanguage={state.globalLanguage}
                      onAnalyzeComplete={(summary) => {
                        setComposeReq(summary);
                        setShowFileAnalyzer(false);
                        showToast('Context updated from file', 'success');
                      }}
                      t={t}
                    />
                  </div>
                </div>
              )}

              <button 
                onClick={handleCompose}
                disabled={loading || !composeReq.trim()}
                className="saas-button primary-button w-full flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <PenTool size={20} />}
                <span>{t('generateReply')}</span>
              </button>
            </div>

            <div className="premium-card p-8 space-y-4 bg-surface/30">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold text-muted uppercase tracking-widest">{t('generatedOutput')}</h3>
                <div className="flex gap-2">
                  {state.lastOutputs.generatedReply && (
                    <button 
                      onClick={() => copyToClipboard(state.lastOutputs.generatedReply)}
                      className="p-2 text-muted hover:text-accent transition-colors"
                    >
                      <Copy size={18} />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 min-h-[100px] text-base leading-relaxed text-text-main whitespace-pre-wrap">
                {state.lastOutputs.subject && (
                  <div className="mb-4 pb-4 border-b border-border-main/50">
                    <span className="text-[10px] text-accent uppercase font-bold block mb-1">Subject</span>
                    <div className="text-text-main font-bold">{state.lastOutputs.subject}</div>
                  </div>
                )}
                {state.lastOutputs.generatedReply || <span className="text-muted/40 italic">Generated reply will appear here...</span>}
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
            className="h-full"
          >
            <VocabManager onSave={setVocab} t={t} />
          </motion.div>
        )}

        {activeTab === 'settings' && (
          <motion.div 
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="premium-card p-6 space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Settings className="text-accent" />
                  {t('settings')}
                </h2>
                <button 
                  onClick={handleReset}
                  className="saas-button secondary-button text-red-400 border-red-500/20 hover:bg-red-500/10 flex items-center gap-2"
                >
                  <RotateCcw size={16} />
                  <span>{t('resetApp')}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] text-muted uppercase font-bold tracking-wider">{t('interfaceLanguage')}</label>
                  <select 
                    value={state.globalLanguage}
                    onChange={async (e) => {
                      const lang = e.target.value as GlobalLanguage;
                      await storage.setGlobalLanguage(lang);
                      setState(prev => ({ ...prev, globalLanguage: lang }));
                      showToast(`Language set to ${lang}`, 'info');
                    }}
                    className="saas-input w-full"
                  >
                    <option value="en" className="bg-surface">English</option>
                    <option value="vi" className="bg-surface">Tiếng Việt</option>
                    <option value="ja" className="bg-surface">日本語</option>
                    <option value="zh-CN" className="bg-surface">简体中文</option>
                    <option value="zh-TW" className="bg-surface">繁體中文</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-muted uppercase font-bold tracking-wider">{t('themeMode')}</label>
                  <div className="flex p-1 glass-panel rounded-full">
                    {(['system', 'light', 'dark'] as ThemeMode[]).map(mode => (
                      <button
                        key={mode}
                        onClick={() => {
                          storage.setTheme(mode);
                          setState(prev => ({ ...prev, themeMode: mode }));
                          applyTheme(resolveTheme(mode));
                          showToast(`Theme: ${mode}`, 'info');
                        }}
                        className={`flex-1 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-2 ${state.themeMode === mode ? 'bg-accent text-white shadow-lg' : 'text-muted/50'}`}
                      >
                        {mode === 'system' && <Monitor size={12} />}
                        {mode === 'light' && <Sun size={12} />}
                        {mode === 'dark' && <Moon size={12} />}
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-white/5 pt-6">
                <AISettingsPanel 
                  settings={state.settings} 
                  t={t}
                  onSave={s => {
                    storage.setSettings(s);
                    setState(prev => ({ ...prev, settings: s }));
                    showToast(t('saveSettings'), 'success');
                  }}
                  onTest={async () => {
                    const ai = new AIService(state.settings);
                    return await ai.testConnection();
                  }}
                />
              </div>

              {IS_PWA && deferredPrompt && (
                <button 
                  onClick={handleInstallPWA}
                  className="saas-button primary-button w-full flex items-center justify-center gap-2"
                >
                  <Download size={20} />
                  <span>{t('installPWA')}</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
