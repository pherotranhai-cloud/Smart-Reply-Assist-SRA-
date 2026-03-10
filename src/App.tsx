import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Languages, 
  PenTool, 
  ClipboardCheck, 
  Settings, 
  BookOpen, 
  Moon, 
  Sun, 
  Copy, 
  Check, 
  Loader2,
  Trash2,
  Download,
  Upload,
  Search,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
  Link2,
  Link2Off,
  RotateCcw,
  Monitor,
  User,
  BarChart3,
  HelpCircle,
  Flag
} from 'lucide-react';
import { storage } from './services/storage';
import { AIService } from './services/ai';
import { normalizeGeminiModelName } from './services/geminiProvider';
import { applyTheme, resolveTheme, watchSystemThemeChanges, ThemeMode } from './utils/theme';
import { RUNTIME, IS_EXTENSION, IS_PWA } from './runtime/env';
import { aiTransport } from './runtime/aiTransport';
import { windowAdapter } from './runtime/window';
import { FileAnalyzer } from './components/FileAnalyzer';
import { 
  VocabItem, 
  AISettings, 
  AppState, 
  Language, 
  Audience, 
  Tone, 
  Format,
  ConversationContext
} from './types';
import { 
  DEFAULT_STATE, 
  LANGUAGES, 
  AUDIENCES, 
  TONES, 
  FORMATS 
} from './constants';

// --- Components ---

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

const VocabularyModal = ({ isOpen, onClose, onSave }: { isOpen: boolean; onClose: () => void; onSave: (vocab: VocabItem[]) => void }) => {
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      storage.getVocab().then(v => {
        setVocab(v);
        setLoading(false);
      });
    }
  }, [isOpen]);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        let imported: any[] = [];
        if (file.name.endsWith('.json')) {
          imported = JSON.parse(content);
        } else if (file.name.endsWith('.csv')) {
          const lines = content.split('\n');
          imported = lines.slice(1).filter(l => l.trim()).map(line => {
            const [term, meaningVi, targetEn, targetZh] = line.split(',').map(s => s.trim());
            return { term, meaningVi, targetEn, targetZh, enabled: true };
          });
        }

        const newVocab = [...vocab];
        imported.forEach(item => {
          const existing = newVocab.find(v => v.term === item.term);
          if (existing) {
            Object.assign(existing, item);
          } else {
            newVocab.push({ ...item, id: crypto.randomUUID(), enabled: true });
          }
        });
        setVocab(newVocab);
      } catch (err) {
        alert('Failed to import file');
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(vocab, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vocabulary.json';
    a.click();
  };

  const filtered = vocab.filter(v => 
    v.term.toLowerCase().includes(search.toLowerCase()) || 
    v.meaningVi.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ duration: 0.2 }}
            className="glass-panel w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden relative z-10"
          >
        <div className="p-6 border-b border-cyber-border flex justify-between items-center">
          <h2 className="text-xl font-bold neon-text-cyan flex items-center gap-2">
            <BookOpen size={24} /> Vocabulary Library
          </h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)]"><X size={24} /></button>
        </div>

        <div className="p-4 bg-[var(--input-bg)] flex gap-4 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={18} />
            <input 
              type="text" 
              placeholder="Search terms..." 
              className="cyber-input w-full pl-10"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <label className="cyber-button bg-neon-cyan/10 border border-neon-cyan/30 px-4 py-2 rounded-lg cursor-pointer hover:bg-neon-cyan/20 flex items-center gap-2 text-neon-cyan">
            <Upload size={16} /> Import
            <input type="file" accept=".json,.csv" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={handleExport} className="cyber-button bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] px-4 py-2 rounded-lg hover:opacity-80 flex items-center gap-2 text-[var(--btn-secondary-text)]">
            <Download size={16} /> Export
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[var(--muted)] text-sm border-b border-cyber-border">
                <th className="pb-2 font-medium">Term</th>
                <th className="pb-2 font-medium">Meaning (VI)</th>
                <th className="pb-2 font-medium">Target EN</th>
                <th className="pb-2 font-medium">Target ZH</th>
                <th className="pb-2 font-medium text-center">Enabled</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id} className="border-b border-cyber-border/50 hover:bg-[var(--accent)]/5 transition-colors">
                  <td className="py-3 font-mono text-neon-cyan">{item.term}</td>
                  <td className="py-3 text-sm">{item.meaningVi}</td>
                  <td className="py-3 text-sm">{item.targetEn}</td>
                  <td className="py-3 text-sm">{item.targetZh}</td>
                  <td className="py-3 text-center">
                    <input 
                      type="checkbox" 
                      checked={item.enabled}
                      onChange={e => {
                        setVocab(vocab.map(v => v.id === item.id ? { ...v, enabled: e.target.checked } : v));
                      }}
                      className="w-4 h-4 accent-neon-cyan"
                    />
                  </td>
                  <td className="py-3 text-right">
                    <button 
                      onClick={() => setVocab(vocab.filter(v => v.id !== item.id))}
                      className="text-[var(--muted)] hover:text-red-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && !loading && (
            <div className="text-center py-10 text-[var(--muted)] italic">No terms found.</div>
          )}
        </div>

        <div className="p-6 border-t border-cyber-border flex justify-end gap-4">
          <button onClick={onClose} className="px-6 py-2 rounded-lg border border-[var(--btn-secondary-border)] hover:bg-[var(--btn-secondary-bg)] transition-colors text-[var(--btn-secondary-text)]">Cancel</button>
          <button 
            onClick={() => {
              storage.setVocab(vocab);
              onSave(vocab);
              onClose();
            }} 
            className="px-8 py-2 rounded-lg bg-neon-cyan text-[var(--btn-text)] font-bold hover:shadow-[0_0_20px_var(--glow)] transition-all"
          >
            Save Library
          </button>
        </div>
      </motion.div>
    </div>
      )}
    </AnimatePresence>
  );
};

const SettingsPanel = ({ settings, onSave, onTest }: { settings: AISettings; onSave: (s: AISettings) => void; onTest: () => Promise<boolean> }) => {
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
    <div className="space-y-4 p-4 glass-panel neon-border">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold neon-text-cyan flex items-center gap-2">
          <Settings size={20} /> AI Engine Configuration
        </h3>
        <div className="flex p-1 bg-[var(--input-bg)] rounded-lg border border-cyber-border">
          <button 
            onClick={() => {
              setLocalSettings({ ...localSettings, activeProvider: 'openai' });
              setAvailableModels([]);
            }}
            className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${activeProvider === 'openai' ? 'bg-neon-cyan text-[var(--btn-text)]' : 'text-[var(--muted)]'}`}
          >
            OpenAI
          </button>
          <button 
            onClick={() => {
              setLocalSettings({ ...localSettings, activeProvider: 'gemini' });
              setAvailableModels([]);
            }}
            className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${activeProvider === 'gemini' ? 'bg-neon-cyan text-[var(--btn-text)]' : 'text-[var(--muted)]'}`}
          >
            Gemini
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-xs text-[var(--muted)] uppercase tracking-wider">Model Name</label>
            <button 
              onClick={handleRefreshModels}
              disabled={testing}
              className="text-[10px] text-neon-cyan hover:underline flex items-center gap-1"
            >
              {testing ? <Loader2 className="animate-spin" size={10} /> : <Check size={10} />} Refresh Models
            </button>
          </div>
          
          {!manualMode && availableModels.length > 0 ? (
            <select 
              className="cyber-input w-full"
              value={current.model}
              onChange={e => updateCurrent({ model: e.target.value })}
            >
              <option value="">Select a model...</option>
              {availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ) : (
            <input 
              type="text" 
              className="cyber-input w-full"
              value={current.model}
              onChange={e => updateCurrent({ model: e.target.value })}
              placeholder={activeProvider === 'openai' ? 'e.g. gpt-4o' : 'e.g. models/gemini-1.5-flash'}
            />
          )}
          
          <div className="flex justify-end">
            <button 
              onClick={() => setManualMode(!manualMode)}
              className="text-[10px] text-[var(--muted)] hover:text-[var(--text)] underline mt-1"
            >
              {manualMode ? 'Use dropdown' : 'Manual model override'}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--muted)] uppercase tracking-wider">API Key</label>
          <input 
            type="password" 
            className="cyber-input w-full"
            value={current.apiKey}
            onChange={e => updateCurrent({ apiKey: e.target.value })}
            placeholder={activeProvider === 'openai' ? 'sk-...' : 'Gemini API Key'}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs text-[var(--muted)] uppercase tracking-wider">Base URL</label>
          <input 
            type="text" 
            className="cyber-input w-full"
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
            className="cyber-button px-4 py-2 rounded-lg bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] hover:opacity-80 flex items-center gap-2 text-sm text-[var(--btn-secondary-text)]"
          >
            {testing ? <Loader2 className="animate-spin" size={16} /> : 'Test Connection'}
          </button>
          {testResult === 'success' && <span className="text-green-500 text-sm flex items-center gap-1 font-medium"><Check size={14} /> Connected</span>}
          {testResult === 'error' && <span className="text-red-500 text-sm flex items-center gap-1 font-medium"><AlertCircle size={14} /> Failed</span>}
        </div>
        <button 
          onClick={() => onSave(localSettings)}
          className="cyber-button px-6 py-2 rounded-lg bg-neon-cyan text-[var(--btn-text)] font-bold text-sm hover:shadow-[0_0_15px_var(--glow)] transition-all"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState<'translate' | 'compose' | 'review' | 'analyze'>('translate');
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [isVocabOpen, setIsVocabOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
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
    const init = async () => {
      try {
        const [settings, themeMode, v, outputs, ctx, summary] = await Promise.all([
          storage.getSettings(),
          storage.getTheme(),
          storage.getVocab(),
          storage.getLastOutputs(),
          storage.getContext(),
          storage.getStructuredSummary()
        ]);

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

        setState(prev => ({ ...prev, settings, themeMode, lastOutputs: outputs, structuredSummary: summary }));
        setVocab(v);
        setContext(ctx);
        
        // Initial theme application
        const resolved = resolveTheme(themeMode);
        applyTheme(resolved);
      } catch (err) {
        console.error('Hydration failed:', err);
      } finally {
        setHydrated(true);
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
    try {
      const ai = new AIService(state.settings);
      const result = await ai.translate(translateInput, targetLang, vocab, translateImage || undefined);
      
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
    if (!composeReq) {
      showToast('Please provide requirements', 'error');
      return;
    }

    // Pull context
    const currentContext = context;
    if (!currentContext || (!currentContext.sourceText && !currentContext.translatedText)) {
      showToast('No message context found. Please translate or paste a message first.', 'error');
      return;
    }

    const contextText = state.lastOutputs.contextSource === 'original' 
      ? currentContext.sourceText 
      : currentContext.translatedText;

    if (!contextText) {
      showToast(`Selected context source (${state.lastOutputs.contextSource}) is empty.`, 'error');
      return;
    }

    setLoading(true);
    try {
      const ai = new AIService(state.settings);
      
      // Check if structured summary is missing or stale
      let currentStructuredSummary = state.structuredSummary;
      const isStale = !currentStructuredSummary || 
        new Date(currentContext.lastUpdatedIso) > new Date(currentStructuredSummary.meta.extractedAtIso);
      
      if (isStale) {
        const sourceLang = currentContext.targetTranslationLanguage || 'Auto';
        currentStructuredSummary = await handleExtract(contextText, sourceLang, state.lastOutputs.contextSource || 'translated');
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
        currentStructuredSummary
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

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to clear all current context and outputs? Settings will be preserved.')) return;
    
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', 'success');
  };

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8 max-w-6xl mx-auto gap-6">
      {/* Header */}
      <header className="flex justify-between items-center glass-panel p-4 neon-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-neon-cyan rounded-lg flex items-center justify-center shadow-[0_0_15px_var(--glow)]">
            <Languages className="text-[var(--btn-text)]" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold neon-text-cyan tracking-tight">SMART REPLY ASSIST</h1>
            <p className="text-[10px] text-[var(--muted)] uppercase tracking-widest">Cybernetic Communication Interface</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {IS_EXTENSION && !windowAdapter.isStandalone() && (
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => windowAdapter.openAppWindow()}
              title="Open in standalone window"
              className="p-2 rounded-lg hover:bg-[var(--accent)]/10 transition-colors text-neon-cyan"
            >
              <Monitor size={20} />
            </motion.button>
          )}
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleReset}
            title="Clear all context and outputs"
            className="p-2 rounded-lg hover:bg-[var(--accent)]/10 transition-colors text-[var(--muted)]"
          >
            <RotateCcw size={20} />
          </motion.button>
          {IS_PWA && deferredPrompt && (
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleInstallPWA}
              title="Install App"
              className="p-2 rounded-lg bg-neon-magenta/20 text-neon-magenta border border-neon-magenta/30 transition-colors"
            >
              <Download size={20} />
            </motion.button>
          )}
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              const modes: ThemeMode[] = ['system', 'light', 'dark'];
              const currentIndex = modes.indexOf(state.themeMode);
              const nextMode = modes[(currentIndex + 1) % modes.length];
              
              storage.setTheme(nextMode);
              setState(prev => ({ ...prev, themeMode: nextMode }));
              
              const resolved = resolveTheme(nextMode);
              applyTheme(resolved);
              
              showToast(`Theme set to ${nextMode}`, 'info');
            }}
            title={`Current theme: ${state.themeMode}`}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-slate-400 flex items-center gap-2"
          >
            {state.themeMode === 'system' && <Monitor size={20} />}
            {state.themeMode === 'dark' && <Moon size={20} />}
            {state.themeMode === 'light' && <Sun size={20} />}
            <span className="text-[10px] font-bold uppercase hidden sm:inline">{state.themeMode}</span>
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`p-2 rounded-lg transition-colors ${isSettingsOpen ? 'bg-neon-cyan/20 text-neon-cyan' : 'hover:bg-[var(--accent)]/10 text-[var(--muted)]'}`}
          >
            <Settings size={20} />
          </motion.button>
        </div>
      </header>

      {/* Settings Panel (Collapsible) */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <SettingsPanel 
              settings={state.settings} 
              onSave={s => {
                storage.setSettings(s);
                setState(prev => ({ ...prev, settings: s }));
                showToast('Settings saved', 'success');
              }}
              onTest={async () => {
                const ai = new AIService(state.settings);
                return await ai.testConnection();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="flex gap-2 p-1 glass-panel neon-border self-center">
        {(['translate', 'compose', 'review', 'analyze'] as const).map(tab => (
          <motion.button
            key={tab}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveTab(tab)}
            className={`px-8 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all ${
              activeTab === tab 
                ? 'bg-neon-cyan text-[var(--btn-text)] shadow-[0_0_15px_var(--glow)]' 
                : 'text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            {tab}
          </motion.button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col gap-6">
        <AnimatePresence mode="wait">
          {activeTab === 'translate' && (
            <motion.div 
              key="translate"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              <div className="glass-panel p-6 space-y-4 scanline relative">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">Input Source</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setTranslateImage(null)}
                      className={`text-[10px] px-2 py-1 rounded border transition-colors ${translateImage ? 'border-neon-magenta text-neon-magenta' : 'border-[var(--border)] text-[var(--muted)]'}`}
                    >
                      {translateImage ? 'Image Attached' : 'Text Only'}
                    </button>
                  </div>
                </div>
                <textarea 
                  className="cyber-input w-full h-48 resize-none font-mono text-sm"
                  placeholder="Paste email, chat, or Ctrl+V to paste image..."
                  value={translateInput}
                  onChange={e => setTranslateInput(e.target.value)}
                  onPaste={handlePaste}
                />
                {translateImage && (
                  <div className="relative group">
                    <img src={translateImage} className="max-h-32 rounded border border-neon-magenta/50" alt="Pasted" />
                    <button 
                      onClick={() => setTranslateImage(null)}
                      className="absolute top-1 right-1 p-1 bg-black/80 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
                <div className="flex gap-4 items-end">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] text-[var(--muted)] uppercase">Target Language</label>
                    <select 
                      className="cyber-input w-full"
                      value={targetLang}
                      onChange={e => setTargetLang(e.target.value as Language)}
                    >
                      {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleTranslate}
                    disabled={loading}
                    className="cyber-button px-8 py-2 bg-neon-cyan text-[var(--btn-text)] font-bold rounded-lg flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <Languages size={18} />}
                    Translate
                  </motion.button>
                </div>
              </div>

              <div className="glass-panel p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">Translated Output</h3>
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => copyToClipboard(state.lastOutputs.translatedText)}
                    className="p-2 hover:bg-[var(--accent)]/10 rounded-lg text-neon-cyan"
                  >
                    <Copy size={18} />
                  </motion.button>
                </div>
                <div className="flex-1 bg-[var(--input-bg)] rounded-lg p-4 font-mono text-sm border border-cyber-border overflow-auto whitespace-pre-wrap">
                  {state.lastOutputs.translatedText || <span className="text-[var(--muted)] italic">Translation will appear here...</span>}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'compose' && (
            <motion.div 
              key="compose"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-5 gap-6"
            >
              <div className="lg:col-span-3 glass-panel p-6 space-y-4">
                {/* Context Preview Box */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">Message Context</h3>
                      {context ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-500 font-bold">
                          <Link2 size={12} /> Linked
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-amber-500 font-bold">
                          <Link2Off size={12} /> No Context
                        </span>
                      )}
                    </div>
                    <div className="flex p-0.5 bg-[var(--input-bg)] rounded border border-cyber-border">
                      <button 
                        onClick={() => {
                          const newOutputs = { ...state.lastOutputs, contextSource: 'translated' as const };
                          setState(prev => ({ ...prev, lastOutputs: newOutputs }));
                          storage.setLastOutputs(newOutputs);
                        }}
                        className={`px-2 py-0.5 text-[9px] font-bold rounded transition-colors ${state.lastOutputs.contextSource === 'translated' ? 'bg-neon-cyan text-[var(--btn-text)]' : 'text-[var(--muted)]'}`}
                      >
                        Translated
                      </button>
                      <button 
                        onClick={() => {
                          const newOutputs = { ...state.lastOutputs, contextSource: 'original' as const };
                          setState(prev => ({ ...prev, lastOutputs: newOutputs }));
                          storage.setLastOutputs(newOutputs);
                        }}
                        className={`px-2 py-0.5 text-[9px] font-bold rounded transition-colors ${state.lastOutputs.contextSource === 'original' ? 'bg-neon-cyan text-[var(--btn-text)]' : 'text-[var(--muted)]'}`}
                      >
                        Original
                      </button>
                    </div>
                  </div>
                  <div className="relative bg-[var(--input-bg)] rounded-lg border border-cyber-border p-3">
                    <div className={`text-xs font-mono text-[var(--text)] overflow-hidden transition-all ${isContextExpanded ? 'max-h-[500px] overflow-auto' : 'max-h-20'}`}>
                      {context ? (
                        state.lastOutputs.contextSource === 'original' ? context.sourceText : context.translatedText
                      ) : (
                        <span className="text-[var(--muted)] italic">No context available. Please translate a message first.</span>
                      )}
                    </div>
                    {context && (
                      <button 
                        onClick={() => setIsContextExpanded(!isContextExpanded)}
                        className="w-full mt-2 flex items-center justify-center gap-1 text-[10px] text-neon-cyan hover:underline border-t border-cyber-border/30 pt-2"
                      >
                        {isContextExpanded ? <><ChevronUp size={12} /> Show Less</> : <><ChevronDown size={12} /> Expand Context</>}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">Composition Parameters</h3>
                    <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                      <span className="text-[9px] font-bold uppercase text-neon-cyan flex items-center gap-1">
                        {extracting ? (
                          <><Loader2 size={10} className="animate-spin" /> EPE Extracting...</>
                        ) : state.structuredSummary ? (
                          <><CheckCircle2 size={10} /> EPE Ready</>
                        ) : (
                          <><AlertCircle size={10} /> EPE Missing</>
                        )}
                      </span>
                      {context && (
                        <button 
                          onClick={() => {
                            const contextText = state.lastOutputs.contextSource === 'original' ? context.sourceText : context.translatedText;
                            const sourceLang = context.targetTranslationLanguage || 'Auto';
                            handleExtract(contextText, sourceLang, state.lastOutputs.contextSource || 'translated');
                          }}
                          disabled={extracting}
                          className="text-[9px] text-[var(--muted)] hover:text-neon-cyan underline"
                        >
                          Re-extract
                        </button>
                      )}
                    </div>
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsVocabOpen(true)}
                    className="flex items-center gap-2 text-xs text-neon-cyan hover:underline"
                  >
                    <BookOpen size={14} /> Manage Vocabulary
                  </motion.button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--muted)] uppercase">Audience</label>
                    <select 
                      className="cyber-input w-full text-xs"
                      value={composeParams.audience}
                      onChange={e => setComposeParams({ ...composeParams, audience: e.target.value as Audience })}
                    >
                      {AUDIENCES.map(a => <option key={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--muted)] uppercase">Tone</label>
                    <select 
                      className="cyber-input w-full text-xs"
                      value={composeParams.tone}
                      onChange={e => setComposeParams({ ...composeParams, tone: e.target.value as Tone })}
                    >
                      {TONES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--muted)] uppercase">Language</label>
                    <select 
                      className="cyber-input w-full text-xs"
                      value={composeParams.lang}
                      onChange={e => setComposeParams({ ...composeParams, lang: e.target.value as Language })}
                    >
                      {LANGUAGES.filter(l => l !== 'Auto').map(l => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--muted)] uppercase">Format</label>
                    <select 
                      className="cyber-input w-full text-xs"
                      value={composeParams.format}
                      onChange={e => setComposeParams({ ...composeParams, format: e.target.value as Format })}
                    >
                      {FORMATS.map(f => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-[var(--muted)] uppercase">Reply Requirements</label>
                  <textarea 
                    className="cyber-input w-full h-32 resize-none text-sm"
                    placeholder="e.g. Confirm the meeting for Thursday at 2 PM, but mention I might be 5 minutes late."
                    value={composeReq}
                    onChange={e => setComposeReq(e.target.value)}
                  />
                </div>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCompose}
                  disabled={loading}
                  className="cyber-button w-full py-3 bg-neon-cyan text-[var(--btn-text)] font-bold rounded-lg flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <PenTool size={20} />}
                  Generate Reply
                </motion.button>
              </div>

              <div className="lg:col-span-2 glass-panel p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">Generated Output</h3>
                  <div className="flex gap-2">
                    {state.lastOutputs.subject && (
                      <button 
                        onClick={() => copyToClipboard(state.lastOutputs.subject!)}
                        className="text-[10px] text-neon-cyan hover:underline"
                      >
                        Copy Subject
                      </button>
                    )}
                    <button 
                      onClick={() => copyToClipboard(state.lastOutputs.generatedReply)}
                      className="p-2 hover:bg-[var(--accent)]/10 rounded-lg text-neon-cyan"
                    >
                      <Copy size={18} />
                    </button>
                  </div>
                </div>
                <div className="flex-1 bg-[var(--input-bg)] rounded-lg p-4 font-mono text-sm border border-cyber-border overflow-auto">
                  {state.lastOutputs.subject && (
                    <div className="mb-4 pb-4 border-b border-cyber-border">
                      <span className="text-neon-magenta text-[10px] uppercase block mb-1">Subject</span>
                      <div className="text-[var(--text)] font-bold">{state.lastOutputs.subject}</div>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">
                    {state.lastOutputs.generatedReply || <span className="text-[var(--muted)] italic">Generated reply will appear here...</span>}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'review' && (
            <motion.div 
              key="review"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-6"
            >
              <div className="flex justify-center">
                <div className="flex p-1 glass-panel neon-border">
                  <button 
                    onClick={() => setReviewToggle('reply')}
                    className={`px-6 py-1.5 rounded-lg text-xs font-bold transition-all ${reviewToggle === 'reply' ? 'bg-neon-cyan text-[var(--btn-text)]' : 'text-[var(--muted)]'}`}
                  >
                    Reply
                  </button>
                  <button 
                    onClick={() => setReviewToggle('summary')}
                    className={`px-6 py-1.5 rounded-lg text-xs font-bold transition-all ${reviewToggle === 'summary' ? 'bg-neon-magenta text-[var(--btn-text)]' : 'text-[var(--muted)]'}`}
                  >
                    Summary
                  </button>
                </div>
              </div>

              <div className="glass-panel p-8 min-h-[400px]">
                {reviewToggle === 'reply' ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center border-b border-cyber-border pb-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-lg font-bold neon-text-cyan">Last Generated Reply</h3>
                        {state.lastOutputs.contextSource && (
                          <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">
                            Source: <span className="text-neon-cyan">{state.lastOutputs.contextSource}</span>
                          </span>
                        )}
                      </div>
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => copyToClipboard(state.lastOutputs.generatedReply)}
                        className="flex items-center gap-2 px-4 py-2 bg-neon-cyan/10 border border-neon-cyan/30 rounded-lg text-neon-cyan hover:bg-neon-cyan/20 transition-all text-sm"
                      >
                        <Copy size={16} /> Copy All
                      </motion.button>
                    </div>
                    <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
                      {state.lastOutputs.subject && (
                        <div className="mb-6 p-4 bg-neon-cyan/5 rounded border-l-4 border-neon-cyan">
                          <span className="text-[10px] text-neon-cyan uppercase block mb-1">Subject</span>
                          <div className="text-lg text-[var(--text)]">{state.lastOutputs.subject}</div>
                        </div>
                      )}
                      {state.lastOutputs.generatedReply || <div className="text-center py-20 text-[var(--muted)] italic">No reply generated yet.</div>}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center border-b border-neon-magenta/20 pb-4">
                      <h3 className="text-lg font-bold neon-text-magenta">Context Summary</h3>
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => copyToClipboard(state.lastOutputs.summary)}
                        className="flex items-center gap-2 px-4 py-2 bg-neon-magenta/10 border border-neon-magenta/30 rounded-lg text-neon-magenta hover:bg-neon-magenta/20 transition-all text-sm"
                      >
                        <Copy size={16} /> Copy Summary
                      </motion.button>
                    </div>
                    <div className="space-y-6">
                      {state.structuredSummary ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Priority Requests */}
                          <div className="glass-panel p-4 border-l-4 border-red-500/50">
                            <div className="flex items-center gap-2 mb-3">
                              <Flag className="text-red-500" size={16} />
                              <h4 className="text-xs font-bold uppercase tracking-widest text-red-500">Priority Requests</h4>
                            </div>
                            <div className="space-y-2">
                              {state.structuredSummary.requests_and_directions
                                .sort((a, b) => a.priority.localeCompare(b.priority))
                                .map((req, idx) => (
                                  <div key={idx} className="p-2 bg-red-500/5 rounded border border-red-500/10">
                                    <div className="flex justify-between items-start gap-2">
                                      <span className="text-[10px] font-bold text-red-400">{req.priority}</span>
                                      <span className="text-[9px] uppercase text-red-500/70">{req.type}</span>
                                    </div>
                                    <p className="text-xs text-[var(--text)] mt-1">{req.content}</p>
                                    {req.due && <div className="text-[9px] text-[var(--muted)] mt-1">Due: {req.due}</div>}
                                  </div>
                                ))}
                              {state.structuredSummary.requests_and_directions.length === 0 && (
                                <div className="text-[10px] text-[var(--muted)] italic">No specific requests found.</div>
                              )}
                            </div>
                          </div>

                          {/* People & Titles */}
                          <div className="glass-panel p-4 border-l-4 border-blue-500/50">
                            <div className="flex items-center gap-2 mb-3">
                              <User className="text-blue-500" size={16} />
                              <h4 className="text-xs font-bold uppercase tracking-widest text-blue-500">People & Titles</h4>
                            </div>
                            <div className="space-y-2">
                              {state.structuredSummary.people_and_roles.slice(0, 3).map((person, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-2 bg-blue-500/5 rounded border border-blue-500/10">
                                  <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs">
                                    {person.name[0]}
                                  </div>
                                  <div>
                                    <div className="text-xs font-bold text-[var(--text)]">{person.honorific} {person.name}</div>
                                    <div className="text-[10px] text-[var(--muted)]">{person.role_title} {person.organization && `@ ${person.organization}`}</div>
                                  </div>
                                </div>
                              ))}
                              {state.structuredSummary.people_and_roles.length === 0 && (
                                <div className="text-[10px] text-[var(--muted)] italic">No people identified.</div>
                              )}
                            </div>
                          </div>

                          {/* Key Metrics */}
                          <div className="glass-panel p-4 border-l-4 border-emerald-500/50">
                            <div className="flex items-center gap-2 mb-3">
                              <BarChart3 className="text-emerald-500" size={16} />
                              <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-500">Key Metrics</h4>
                            </div>
                            <div className="space-y-2">
                              {state.structuredSummary.production_data.map((data, idx) => (
                                <div key={idx} className="flex justify-between items-center p-2 bg-emerald-500/5 rounded border border-emerald-500/10">
                                  <div>
                                    <div className="text-[10px] text-emerald-400 font-bold">{data.item}</div>
                                    <div className="text-[9px] text-[var(--muted)] uppercase">{data.metric}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xs font-bold text-[var(--text)]">{data.value}{data.unit}</div>
                                    <div className="text-[9px] text-[var(--muted)]">{data.timeframe}</div>
                                  </div>
                                </div>
                              ))}
                              {state.structuredSummary.production_data.length === 0 && (
                                <div className="text-[10px] text-[var(--muted)] italic">No metrics identified.</div>
                              )}
                            </div>
                          </div>

                          {/* Questions / Gaps */}
                          <div className="glass-panel p-4 border-l-4 border-amber-500/50">
                            <div className="flex items-center gap-2 mb-3">
                              <HelpCircle className="text-amber-500" size={16} />
                              <h4 className="text-xs font-bold uppercase tracking-widest text-amber-500">Questions / Gaps</h4>
                            </div>
                            <div className="space-y-2">
                              {state.structuredSummary.risks_gaps_questions.map((q, idx) => (
                                <div key={idx} className="p-2 bg-amber-500/5 rounded border border-amber-500/10">
                                  <div className="text-[9px] font-bold text-amber-400 uppercase">{q.priority} // {q.gap}</div>
                                  <p className="text-xs text-[var(--text)] mt-1 italic">"{q.question}"</p>
                                </div>
                              ))}
                              {state.structuredSummary.risks_gaps_questions.length === 0 && (
                                <div className="text-[10px] text-[var(--muted)] italic">No gaps or questions identified.</div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="font-sans text-sm leading-relaxed whitespace-pre-wrap border-t border-cyber-border/30 pt-6">
                        {state.lastOutputs.summary || <div className="text-center py-20 text-slate-700 italic">Summary will be generated automatically when you translate a message.</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'analyze' && (
            <motion.div
              key="analyze"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
            >
              <FileAnalyzer 
                settings={state.settings} 
                onAnalyzeComplete={async (summary) => {
                  // Save summary to context and switch to compose tab
                  const newContext: ConversationContext = {
                    sourceText: summary,
                    translatedText: summary,
                    summaryText: summary,
                    targetTranslationLanguage: 'Auto',
                    lastUpdatedIso: new Date().toISOString(),
                    contextSource: 'original'
                  };
                  
                  setContext(newContext);
                  await storage.setContext(newContext);
                  
                  const newOutputs = { 
                    ...state.lastOutputs, 
                    summary, 
                    contextSource: 'original' as const 
                  };
                  setState(prev => ({ ...prev, lastOutputs: newOutputs }));
                  await storage.setLastOutputs(newOutputs);
                  
                  // Trigger EPE Extraction silently
                  handleExtract(summary, 'Auto', 'original');
                  
                  setActiveTab('compose');
                  showToast('Context loaded. Ready to compose.', 'success');
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <VocabularyModal 
        isOpen={isVocabOpen} 
        onClose={() => setIsVocabOpen(false)} 
        onSave={v => setVocab(v)}
      />

      <AnimatePresence>
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="text-center text-[10px] text-slate-600 uppercase tracking-[0.2em] py-4">
        Smart Reply Assist v1.0.0 // Neural Link Established
      </footer>
    </div>
  );
}
