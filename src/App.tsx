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
import { translations } from './i18n';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
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
      const loadVocab = async () => {
        setLoading(true);
        try {
          const response = await fetch('/api/vocab');
          if (response.ok) {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const data = await response.json();
              if (Array.isArray(data)) {
                setVocab(data);
                storage.setVocab(data);
                setLoading(false);
                return;
              }
            } else {
              console.warn('Expected JSON from /api/vocab but received non-JSON response');
            }
          }
        } catch (err) {
          console.error('Failed to fetch vocab from backend:', err);
        }

        const v = await storage.getVocab();
        setVocab(v);
        setLoading(false);
      };
      loadVocab();
    }
  }, [isOpen]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let imported: any[] = [];

      if (file.name.endsWith('.json')) {
        const text = await file.text();
        imported = JSON.parse(text);
      } else if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const results = Papa.parse(text, { header: true, skipEmptyLines: true });
        imported = results.data.map((row: any) => ({
          term: row.term || row.Term || '',
          meaning_vi: row.meaning_vi || row.meaningVi || row.MeaningVi || row['Meaning (VI)'] || '',
          target_en: row.target_en || row.targetEn || row.TargetEn || row['Target EN'] || '',
          target_zh: row.target_zh || row.targetZh || row.TargetZh || row['Target ZH'] || '',
          enabled: true
        }));
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        imported = jsonData.map((row: any) => ({
          term: row.term || row.Term || '',
          meaning_vi: row.meaning_vi || row.meaningVi || row.MeaningVi || row['Meaning (VI)'] || '',
          target_en: row.target_en || row.targetEn || row.TargetEn || row['Target EN'] || '',
          target_zh: row.target_zh || row.targetZh || row.TargetZh || row['Target ZH'] || '',
          enabled: true
        }));
      }

      // Filter out empty rows and ensure required fields
      const validImported = imported.filter(item => item && item.term && item.meaning_vi);

      if (validImported.length === 0) {
        alert('No valid vocabulary items found in file');
        return;
      }

      // Send to Backend sync
      try {
        const response = await fetch('/api/import-vocab', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validImported)
        });
        
        let result: any = {};
        try {
          const text = await response.text();
          try {
            result = JSON.parse(text);
          } catch (e) {
            // Not JSON, use the raw text
            if (!response.ok) throw new Error(`Server error (${response.status}): ${text || response.statusText}`);
          }
        } catch (e: any) {
          if (!response.ok && !result.error) throw e;
        }
        
        if (!response.ok) {
          const errorMessage = result.details ? `${result.error}: ${result.details}` : (result.error || `Failed to sync with server (${response.status})`);
          throw new Error(errorMessage);
        }
        
        console.log('Server sync success:', result);
      } catch (syncErr: any) {
        console.error('Sync error (continuing locally):', syncErr);
        // We continue locally even if sync fails
      }

      const newVocab = [...vocab];
      validImported.forEach(item => {
        const existing = newVocab.find(v => v.term === item.term);
        if (existing) {
          Object.assign(existing, item);
        } else {
          newVocab.push({ ...item, id: crypto.randomUUID(), enabled: true });
        }
      });
      setVocab(newVocab);
      alert(`Successfully imported ${validImported.length} items`);
    } catch (err: any) {
      console.error('Import error:', err);
      alert('Failed to import file: ' + err.message);
    }
    
    // Reset input
    e.target.value = '';
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
    v.meaning_vi.toLowerCase().includes(search.toLowerCase())
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
            <input type="file" accept=".json,.csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={handleExport} className="cyber-button bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] px-4 py-2 rounded-lg hover:opacity-80 flex items-center gap-2 text-[var(--btn-secondary-text)]">
            <Download size={16} /> Export
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-[300px]">
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
                  <td className="py-3 text-sm">{item.meaning_vi}</td>
                  <td className="py-3 text-sm">{item.target_en}</td>
                  <td className="py-3 text-sm">{item.target_zh}</td>
                  <td className="py-3 text-center">
                    <input 
                      type="checkbox" 
                      checked={item.enabled === true || item.enabled === 'true'}
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

const SettingsPanel = ({ settings, onSave, onTest, t }: { settings: AISettings; onSave: (s: AISettings) => void; onTest: () => Promise<boolean>; t: any }) => {
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
          <Settings size={20} /> {t('aiEngineConfig')}
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
            <label className="text-xs text-[var(--muted)] uppercase tracking-wider">{t('modelName')}</label>
            <button 
              onClick={handleRefreshModels}
              disabled={testing}
              className="text-[10px] text-neon-cyan hover:underline flex items-center gap-1"
            >
              {testing ? <Loader2 className="animate-spin" size={10} /> : <Check size={10} />} {t('refreshModels')}
            </button>
          </div>
          
          {!manualMode && availableModels.length > 0 ? (
            <select 
              className="cyber-input w-full"
              value={current.model}
              onChange={e => updateCurrent({ model: e.target.value })}
            >
              <option value="">{t('selectModel')}</option>
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
              {manualMode ? t('useDropdown') : t('manualOverride')}
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--muted)] uppercase tracking-wider">{t('apiKey')}</label>
          <input 
            type="password" 
            className="cyber-input w-full"
            value={current.apiKey}
            onChange={e => updateCurrent({ apiKey: e.target.value })}
            placeholder={activeProvider === 'openai' ? 'sk-...' : 'Gemini API Key'}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs text-[var(--muted)] uppercase tracking-wider">{t('baseUrl')}</label>
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
            {testing ? <Loader2 className="animate-spin" size={16} /> : t('testConnection')}
          </button>
          {testResult === 'success' && <span className="text-green-500 text-sm flex items-center gap-1 font-medium"><Check size={14} /> {t('connected')}</span>}
          {testResult === 'error' && <span className="text-red-500 text-sm flex items-center gap-1 font-medium"><AlertCircle size={14} /> {t('failed')}</span>}
        </div>
        <button 
          onClick={() => onSave(localSettings)}
          className="cyber-button px-6 py-2 rounded-lg bg-neon-cyan text-[var(--btn-text)] font-bold text-sm hover:shadow-[0_0_15px_var(--glow)] transition-all"
        >
          {t('saveSettings')}
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
  const [isCopied, setIsCopied] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<string>(() => localStorage.getItem('app-theme') || 'cyberpunk');
  
  const outputRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('app-theme', currentTheme);
  }, [currentTheme]);

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
    <div className="min-h-screen flex flex-col p-4 md:p-8 max-w-6xl mx-auto gap-6 pb-24 sm:pb-0">
      {/* Header */}
      <header className="flex justify-between items-center glass-panel py-2 px-3 sm:p-4 neon-border shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary rounded-lg flex items-center justify-center shadow-[0_0_15px_var(--glow)] shrink-0">
            <Languages className="text-black" size={18} />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
            <h1 className="text-sm sm:text-xl font-bold text-primary drop-shadow-[0_0_5px_var(--glow)] tracking-tight leading-tight">SMART REPLY ASSIST</h1>
            <p className="text-[10px] text-[var(--muted)] uppercase tracking-widest hidden sm:block">Cybernetic Communication Interface</p>
          </div>
        </div>
        <div className="flex items-center gap-0 sm:gap-2">
          <div className="flex items-center justify-center min-w-[44px] min-h-[44px] border-r border-white/10 pr-1 sm:pr-2">
            <Monitor size={14} className="text-primary sm:size-4" />
            <select 
              value={currentTheme}
              onChange={(e) => setCurrentTheme(e.target.value)}
              className="bg-transparent text-[10px] sm:text-xs font-bold text-primary border-none focus:ring-0 cursor-pointer uppercase p-0 ml-1"
            >
              <option value="cyberpunk" className="bg-slate-900">CYBER</option>
              <option value="matrix" className="bg-slate-900">MATRIX</option>
              <option value="synthwave" className="bg-slate-900">SYNTH</option>
            </select>
          </div>

          <div className="flex items-center justify-center min-w-[44px] min-h-[44px] border-r border-white/10 pr-1 sm:pr-2">
            <Flag size={14} className="text-primary sm:size-4" />
            <select 
              value={state.globalLanguage}
              onChange={async (e) => {
                const lang = e.target.value as GlobalLanguage;
                await storage.setGlobalLanguage(lang);
                setState(prev => ({ ...prev, globalLanguage: lang }));
                const langNames: Record<GlobalLanguage, string> = {
                  en: 'English',
                  vi: 'Tiếng Việt',
                  ja: '日本語',
                  'zh-CN': '简体中文',
                  'zh-TW': '繁體中文'
                };
                showToast(`Language set to ${langNames[lang]}`, 'info');
              }}
              className="bg-transparent text-[10px] sm:text-xs font-bold text-primary border-none focus:ring-0 cursor-pointer uppercase p-0 ml-1"
            >
              <option value="en" className="bg-slate-900">EN</option>
              <option value="vi" className="bg-slate-900">VI</option>
              <option value="ja" className="bg-slate-900">JA</option>
              <option value="zh-CN" className="bg-slate-900">ZH-CN</option>
              <option value="zh-TW" className="bg-slate-900">ZH-TW</option>
            </select>
          </div>

          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleReset}
            title="Clear all context and outputs"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-[var(--accent)]/10 transition-colors text-[var(--muted)]"
          >
            <RotateCcw size={18} className="sm:size-5" />
          </motion.button>
          {IS_PWA && deferredPrompt && (
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleInstallPWA}
              title="Install App"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-neon-magenta/20 text-neon-magenta border border-neon-magenta/30 transition-colors"
            >
              <Download size={18} className="sm:size-5" />
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
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors text-slate-400 gap-1 sm:gap-2"
          >
            {state.themeMode === 'system' && <Monitor size={18} className="sm:size-5" />}
            {state.themeMode === 'dark' && <Moon size={18} className="sm:size-5" />}
            {state.themeMode === 'light' && <Sun size={18} className="sm:size-5" />}
            <span className="text-[10px] font-bold uppercase hidden sm:inline">{state.themeMode}</span>
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors ${isSettingsOpen ? 'bg-neon-cyan/20 text-neon-cyan' : 'hover:bg-[var(--accent)]/10 text-[var(--muted)]'}`}
          >
            <Settings size={18} className="sm:size-5" />
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
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="fixed bottom-0 left-0 w-full z-50 bg-background/90 backdrop-blur-md border-t border-primary/50 shadow-[0_-4px_15px_var(--glow)] flex justify-around items-center h-16 sm:relative sm:bottom-auto sm:left-auto sm:w-auto sm:z-auto sm:bg-transparent sm:backdrop-blur-none sm:border-t-0 sm:shadow-none sm:h-auto sm:gap-2 sm:p-1 sm:glass-panel sm:neon-border sm:self-center">
        {(['translate', 'compose', 'review', 'analyze'] as const).map(tab => {
          const Icon = tab === 'translate' ? Languages : 
                       tab === 'compose' ? PenTool : 
                       tab === 'review' ? ClipboardCheck : BarChart3;
          return (
            <motion.button
              key={tab}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveTab(tab)}
              className={`min-w-[64px] min-h-[44px] flex flex-col items-center justify-center transition-all sm:px-8 sm:py-2 sm:rounded-lg sm:text-sm sm:font-bold sm:uppercase sm:tracking-wider ${
                activeTab === tab 
                  ? 'text-primary drop-shadow-[0_0_8px_var(--glow)] sm:bg-primary sm:text-black sm:shadow-[0_0_15px_var(--glow)] sm:drop-shadow-none' 
                  : 'text-primary/40 sm:text-[var(--muted)] sm:hover:text-[var(--text)]'
              }`}
            >
              <Icon size={20} className="sm:hidden" />
              <span className="text-[10px] sm:text-sm font-bold uppercase tracking-wider mt-1 sm:mt-0">{t(tab)}</span>
            </motion.button>
          );
        })}
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
                  <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">{t('inputSource')}</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setTranslateImage(null)}
                      className={`text-[10px] px-2 py-1 rounded border transition-colors ${translateImage ? 'border-neon-magenta text-neon-magenta' : 'border-[var(--border)] text-[var(--muted)]'}`}
                    >
                      {translateImage ? t('imageAttached') : t('textOnly')}
                    </button>
                  </div>
                </div>
                <div className="relative group">
                  <textarea 
                    className="cyber-input w-full h-48 min-h-[120px] resize-none font-mono text-sm focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                    placeholder={t('inputPlaceholder')}
                    value={translateInput}
                    onChange={e => setTranslateInput(e.target.value)}
                    onPaste={handlePaste}
                  />
                  <div className="absolute bottom-3 right-3 flex gap-2">
                    <button 
                      onClick={handleClearInput}
                      title="Clear"
                      className="p-2 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 text-[var(--muted)] hover:text-red-400 transition-colors"
                    >
                      <X size={16} />
                    </button>
                    <button 
                      onClick={handlePasteFromClipboard}
                      title="Paste"
                      className="p-2 bg-black/40 backdrop-blur-md rounded-lg border border-white/10 text-[var(--muted)] hover:text-primary transition-colors"
                    >
                      <ClipboardCheck size={16} />
                    </button>
                  </div>
                </div>
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
                <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] text-[var(--muted)] uppercase">{t('targetLanguage')}</label>
                    <select 
                      className="cyber-input w-full min-h-[48px] py-3"
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
                    className="cyber-button px-8 py-3 min-h-[48px] bg-primary text-black font-bold rounded-lg flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <Languages size={18} />}
                    {t('translate')}
                  </motion.button>
                </div>
              </div>

              <div ref={outputRef} className="glass-panel p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">{t('translatedOutput')}</h3>
                </div>
                <div className="flex-1 bg-[var(--input-bg)] rounded-lg p-4 font-mono text-base leading-relaxed border border-cyber-border overflow-auto whitespace-pre-wrap">
                  {state.lastOutputs.translatedText || <span className="text-[var(--muted)] italic">{t('translationPlaceholder')}</span>}
                </div>
                {state.lastOutputs.translatedText && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleCopy(state.lastOutputs.translatedText)}
                    className={`w-full min-h-[48px] mt-4 flex justify-center items-center gap-2 rounded-lg font-bold transition-all border ${
                      isCopied 
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                        : 'bg-primary/10 border-primary text-primary hover:bg-primary/20'
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check size={20} />
                        <span>COPIED!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={20} />
                        <span>COPY TRANSLATION</span>
                      </>
                    )}
                  </motion.button>
                )}
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
                      <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">{t('messageContext')}</h3>
                      {context ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-500 font-bold">
                          <Link2 size={12} /> {t('linked')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-amber-500 font-bold">
                          <Link2Off size={12} /> {t('noLinked')}
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
                        {t('translate')}
                      </button>
                      <button 
                        onClick={() => {
                          const newOutputs = { ...state.lastOutputs, contextSource: 'original' as const };
                          setState(prev => ({ ...prev, lastOutputs: newOutputs }));
                          storage.setLastOutputs(newOutputs);
                        }}
                        className={`px-2 py-0.5 text-[9px] font-bold rounded transition-colors ${state.lastOutputs.contextSource === 'original' ? 'bg-neon-cyan text-[var(--btn-text)]' : 'text-[var(--muted)]'}`}
                      >
                        {t('source')}
                      </button>
                    </div>
                  </div>
                  <div className="relative bg-[var(--input-bg)] rounded-lg border border-cyber-border p-3">
                    <div className={`text-xs font-mono text-[var(--text)] overflow-hidden transition-all ${isContextExpanded ? 'max-h-[500px] overflow-auto' : 'max-h-20'}`}>
                      {context ? (
                        state.lastOutputs.contextSource === 'original' ? context.sourceText : context.translatedText
                      ) : (
                        <span className="text-[var(--muted)] italic">{t('noContext')}</span>
                      )}
                    </div>
                    {context && (
                      <button 
                        onClick={() => setIsContextExpanded(!isContextExpanded)}
                        className="w-full mt-2 flex items-center justify-center gap-1 text-[10px] text-neon-cyan hover:underline border-t border-cyber-border/30 pt-2"
                      >
                        {isContextExpanded ? <><ChevronUp size={12} /> {t('showLess')}</> : <><ChevronDown size={12} /> {t('expandContext')}</>}
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">{t('compositionParameters')}</h3>
                    <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/20">
                      <span className="text-[9px] font-bold uppercase text-neon-cyan flex items-center gap-1">
                        {extracting ? (
                          <><Loader2 size={10} className="animate-spin" /> {t('epeExtracting')}</>
                        ) : state.structuredSummary ? (
                          <><CheckCircle2 size={10} /> {t('epeReady')}</>
                        ) : (
                          <><AlertCircle size={10} /> {t('epeMissing')}</>
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
                          {t('reExtract')}
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
                    <BookOpen size={14} /> {t('manageVocabulary')}
                  </motion.button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--muted)] uppercase">{t('audience')}</label>
                    <select 
                      className="cyber-input w-full text-xs"
                      value={composeParams.audience}
                      onChange={e => setComposeParams({ ...composeParams, audience: e.target.value as Audience })}
                    >
                      {AUDIENCES.map(a => <option key={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--muted)] uppercase">{t('tone')}</label>
                    <select 
                      className="cyber-input w-full text-xs"
                      value={composeParams.tone}
                      onChange={e => setComposeParams({ ...composeParams, tone: e.target.value as Tone })}
                    >
                      {TONES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--muted)] uppercase">{t('language')}</label>
                    <select 
                      className="cyber-input w-full text-xs"
                      value={composeParams.lang}
                      onChange={e => setComposeParams({ ...composeParams, lang: e.target.value as Language })}
                    >
                      {LANGUAGES.filter(l => l !== 'Auto').map(l => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-[var(--muted)] uppercase">{t('format')}</label>
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
                  <label className="text-[10px] text-[var(--muted)] uppercase">{t('replyRequirements')}</label>
                  <textarea 
                    className="cyber-input w-full h-32 resize-none text-sm"
                    placeholder={t('replyPlaceholder')}
                    value={composeReq}
                    onChange={e => setComposeReq(e.target.value)}
                  />
                </div>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCompose}
                  disabled={loading || !composeReq.trim()}
                  className="cyber-button w-full py-3 bg-neon-cyan text-[var(--btn-text)] font-bold rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <PenTool size={20} />}
                  {t('generateReply')}
                </motion.button>
              </div>

              <div className="lg:col-span-2 glass-panel p-6 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">{t('generatedOutput')}</h3>
                  <div className="flex gap-2">
                    {state.lastOutputs.subject && (
                      <button 
                        onClick={() => copyToClipboard(state.lastOutputs.subject!)}
                        className="text-[10px] text-neon-cyan hover:underline"
                      >
                        {t('copySubject')}
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
                    {t('reply')}
                  </button>
                  <button 
                    onClick={() => setReviewToggle('summary')}
                    className={`px-6 py-1.5 rounded-lg text-xs font-bold transition-all ${reviewToggle === 'summary' ? 'bg-neon-magenta text-[var(--btn-text)]' : 'text-[var(--muted)]'}`}
                  >
                    {t('summary')}
                  </button>
                </div>
              </div>

              <div className="glass-panel p-8 min-h-[400px]">
                {reviewToggle === 'reply' ? (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center border-b border-cyber-border pb-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-lg font-bold neon-text-cyan">{t('lastGeneratedReply')}</h3>
                        {state.lastOutputs.contextSource && (
                          <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">
                            {t('source')}: <span className="text-neon-cyan">{t(state.lastOutputs.contextSource as any)}</span>
                          </span>
                        )}
                      </div>
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => copyToClipboard(state.lastOutputs.generatedReply)}
                        className="flex items-center gap-2 px-4 py-2 bg-neon-cyan/10 border border-neon-cyan/30 rounded-lg text-neon-cyan hover:bg-neon-cyan/20 transition-all text-sm"
                      >
                        <Copy size={16} /> {t('copyAll')}
                      </motion.button>
                    </div>
                    <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
                      {state.lastOutputs.subject && (
                        <div className="mb-6 p-4 bg-neon-cyan/5 rounded border-l-4 border-neon-cyan">
                          <span className="text-[10px] text-neon-cyan uppercase block mb-1">{t('subject')}</span>
                          <div className="text-lg text-[var(--text)]">{state.lastOutputs.subject}</div>
                        </div>
                      )}
                      {state.lastOutputs.generatedReply || <div className="text-center py-20 text-[var(--muted)] italic">{t('noReplyGenerated')}</div>}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center border-b border-neon-magenta/20 pb-4">
                      <h3 className="text-lg font-bold neon-text-magenta">{t('contextSummary')}</h3>
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => copyToClipboard(state.lastOutputs.summary)}
                        className="flex items-center gap-2 px-4 py-2 bg-neon-magenta/10 border border-neon-magenta/30 rounded-lg text-neon-magenta hover:bg-neon-magenta/20 transition-all text-sm"
                      >
                        <Copy size={16} /> {t('copySummary')}
                      </motion.button>
                    </div>
                    <div className="space-y-6">
                      {state.structuredSummary ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Priority Requests */}
                          <div className="glass-panel p-4 border-l-4 border-red-500/50">
                            <div className="flex items-center gap-2 mb-3">
                              <Flag className="text-red-500" size={16} />
                              <h4 className="text-xs font-bold uppercase tracking-widest text-red-500">{t('priorityRequests')}</h4>
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
                                <div className="text-[10px] text-[var(--muted)] italic">{t('noRequests')}</div>
                              )}
                            </div>
                          </div>

                          {/* People & Titles */}
                          <div className="glass-panel p-4 border-l-4 border-blue-500/50">
                            <div className="flex items-center gap-2 mb-3">
                              <User className="text-blue-500" size={16} />
                              <h4 className="text-xs font-bold uppercase tracking-widest text-blue-500">{t('peopleAndRoles')}</h4>
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
                                <div className="text-[10px] text-[var(--muted)] italic">{t('noPeople')}</div>
                              )}
                            </div>
                          </div>

                          {/* Key Metrics */}
                          <div className="glass-panel p-4 border-l-4 border-emerald-500/50">
                            <div className="flex items-center gap-2 mb-3">
                              <BarChart3 className="text-emerald-500" size={16} />
                              <h4 className="text-xs font-bold uppercase tracking-widest text-emerald-500">{t('keyMetrics')}</h4>
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
                                <div className="text-[10px] text-[var(--muted)] italic">{t('noMetrics')}</div>
                              )}
                            </div>
                          </div>

                          {/* Questions / Gaps */}
                          <div className="glass-panel p-4 border-l-4 border-amber-500/50">
                            <div className="flex items-center gap-2 mb-3">
                              <HelpCircle className="text-amber-500" size={16} />
                              <h4 className="text-xs font-bold uppercase tracking-widest text-amber-500">{t('questionsGaps')}</h4>
                            </div>
                            <div className="space-y-2">
                              {state.structuredSummary.risks_gaps_questions.map((q, idx) => (
                                <div key={idx} className="p-2 bg-amber-500/5 rounded border border-amber-500/10">
                                  <div className="text-[9px] font-bold text-amber-400 uppercase">{q.priority} // {q.gap}</div>
                                  <p className="text-xs text-[var(--text)] mt-1 italic">"{q.question}"</p>
                                </div>
                              ))}
                              {state.structuredSummary.risks_gaps_questions.length === 0 && (
                                <div className="text-[10px] text-[var(--muted)] italic">{t('noQuestions')}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="font-sans text-sm leading-relaxed whitespace-pre-wrap border-t border-cyber-border/30 pt-6">
                        {state.lastOutputs.summary || <div className="text-center py-20 text-slate-700 italic">{t('summaryPlaceholder')}</div>}
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
                globalLanguage={state.globalLanguage === 'vi' ? 'Vietnamese' : state.globalLanguage === 'ja' ? 'Japanese' : 'English'}
                t={t}
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
