import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  RotateCcw, 
  Languages, 
  Moon, 
  Sun, 
  Monitor, 
  ChevronRight,
  Shield,
  Info,
  Database,
  Cpu,
  Key,
  Globe,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { ThemeMode, GlobalLanguage, AISettings } from '../types';
import { AIService } from '../services/ai';

interface SettingsPanelProps {
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  globalLanguage: GlobalLanguage;
  onLanguageChange: (lang: GlobalLanguage) => void;
  onReset: () => void;
  settings: AISettings;
  onSaveSettings: (s: AISettings) => void;
  onTestConnection: () => Promise<boolean>;
  t: (key: string) => string;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  themeMode,
  onThemeChange,
  globalLanguage,
  onLanguageChange,
  onReset,
  settings,
  onSaveSettings,
  onTestConnection,
  t
}) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string }[]>([]);
  const [manualMode, setManualMode] = useState(false);

  const handleRefreshModels = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const ai = new AIService(localSettings);
      const success = await ai.testConnection();
      if (success) {
        const provider = localSettings.activeProvider === 'openai' 
          ? new (await import('../services/openaiProvider')).OpenAIProvider(localSettings.openai)
          : new (await import('../services/geminiProvider')).GeminiProvider(localSettings.gemini);
        
        const models = await provider.listModels();
        setAvailableModels(models);
        if (!localSettings[localSettings.activeProvider].model && models.length > 0) {
          updateCurrent({ model: models[0].id });
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
    const newSettings = {
      ...localSettings,
      [activeProvider]: { ...current, ...updates }
    };
    setLocalSettings(newSettings);
    onSaveSettings(newSettings); // Auto-save on change for iOS feel
  };

  const themeOptions: { mode: ThemeMode; label: string }[] = [
    { mode: 'light', label: 'Light' },
    { mode: 'dark', label: 'Dark' },
    { mode: 'system', label: 'System' },
  ];

  const languageOptions: { lang: GlobalLanguage; label: string }[] = [
    { lang: 'en', label: 'English' },
    { lang: 'vi', label: 'Tiếng Việt' },
    { lang: 'zh-CN', label: '简体中文' },
    { lang: 'zh-TW', label: '繁體中文' },
  ];

  return (
    <div className="space-y-8 pb-24 font-sans pt-4">
      {/* Appearance */}
      <section>
        <h3 className="text-[13px] font-medium text-slate-500 uppercase tracking-wide px-4 mb-2">
          {t('themeMode')}
        </h3>
        <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="p-3">
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {themeOptions.map((opt) => (
                <button
                  key={opt.mode}
                  onClick={() => onThemeChange(opt.mode)}
                  className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                    themeMode === opt.mode
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Language */}
      <section>
        <h3 className="text-[13px] font-medium text-slate-500 uppercase tracking-wide px-4 mb-2">
          {t('interfaceLanguage')}
        </h3>
        <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
          {languageOptions.map((opt, idx) => (
            <button
              key={opt.lang}
              onClick={() => onLanguageChange(opt.lang)}
              className={`w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 transition-colors active:bg-slate-50 dark:active:bg-slate-800/50 ${
                idx !== languageOptions.length - 1 ? 'border-b border-slate-200 dark:border-slate-800' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center text-white">
                  <Languages size={16} />
                </div>
                <span className="text-[17px] text-slate-900 dark:text-white">{opt.label}</span>
              </div>
              {globalLanguage === opt.lang ? (
                <span className="text-blue-600 dark:text-blue-400 text-[17px]">✓</span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      {/* AI Engine */}
      <section>
        <h3 className="text-[13px] font-medium text-slate-500 uppercase tracking-wide px-4 mb-2">
          {t('aiEngineConfig')}
        </h3>
        <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
          
          {/* Provider Switcher */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => {
                  const newSettings = { ...localSettings, activeProvider: 'openai' as const };
                  setLocalSettings(newSettings);
                  setAvailableModels([]);
                  onSaveSettings(newSettings);
                }}
                className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                  activeProvider === 'openai'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                OpenAI
              </button>
              <button
                onClick={() => {
                  const newSettings = { ...localSettings, activeProvider: 'gemini' as const };
                  setLocalSettings(newSettings);
                  setAvailableModels([]);
                  onSaveSettings(newSettings);
                }}
                className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                  activeProvider === 'gemini'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                Gemini
              </button>
            </div>
          </div>

          {/* Model */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-7 h-7 rounded-md bg-indigo-500 flex items-center justify-center text-white shrink-0">
                <Cpu size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[17px] text-slate-900 dark:text-white">{t('modelName')}</span>
                  <button 
                    onClick={handleRefreshModels}
                    disabled={testing}
                    className="text-blue-600 dark:text-blue-400"
                  >
                    {testing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  </button>
                </div>
                {!manualMode && availableModels.length > 0 ? (
                  <select 
                    className="w-full bg-transparent text-[15px] text-blue-600 dark:text-blue-400 outline-none appearance-none"
                    value={current.model}
                    onChange={e => updateCurrent({ model: e.target.value })}
                  >
                    <option value="">{t('selectModel')}</option>
                    {availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                ) : (
                  <input 
                    type="text" 
                    className="w-full bg-transparent text-[15px] text-blue-600 dark:text-blue-400 outline-none placeholder-slate-400"
                    value={current.model}
                    onChange={e => updateCurrent({ model: e.target.value })}
                    placeholder={activeProvider === 'openai' ? 'e.g. gpt-4o' : 'e.g. models/gemini-1.5-flash'}
                  />
                )}
              </div>
            </div>
          </div>

          {/* API Key */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center text-white shrink-0">
                <Key size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[17px] text-slate-900 dark:text-white block mb-1">{t('apiKey')}</span>
                <input 
                  type="password" 
                  className="w-full bg-transparent text-[15px] text-blue-600 dark:text-blue-400 outline-none placeholder-slate-400"
                  value={current.apiKey}
                  onChange={e => updateCurrent({ apiKey: e.target.value })}
                  placeholder={activeProvider === 'openai' ? 'sk-...' : 'Gemini API Key'}
                />
              </div>
            </div>
          </div>

          {/* Base URL */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-7 h-7 rounded-md bg-emerald-500 flex items-center justify-center text-white shrink-0">
                <Globe size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[17px] text-slate-900 dark:text-white block mb-1">{t('baseUrl')}</span>
                <input 
                  type="text" 
                  className="w-full bg-transparent text-[15px] text-blue-600 dark:text-blue-400 outline-none placeholder-slate-400"
                  value={current.baseUrl}
                  onChange={e => updateCurrent({ baseUrl: e.target.value })}
                  placeholder={activeProvider === 'openai' ? 'https://api.openai.com/v1' : 'https://generativelanguage.googleapis.com'}
                />
              </div>
            </div>
          </div>

          {/* Test Connection */}
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
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-medium transition-colors active:bg-slate-50 dark:active:bg-slate-800/50"
          >
            {testing ? <Loader2 className="animate-spin" size={18} /> : t('testConnection')}
            {testResult === 'success' && <Check size={18} className="text-emerald-500" />}
            {testResult === 'error' && <AlertCircle size={18} className="text-red-500" />}
          </button>

        </div>
      </section>

      {/* System Actions */}
      <section>
        <h3 className="text-[13px] font-medium text-slate-500 uppercase tracking-wide px-4 mb-2">
          System
        </h3>
        <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800">
          <button
            onClick={onReset}
            className="w-full flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 transition-colors active:bg-slate-50 dark:active:bg-slate-800/50"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-red-500 flex items-center justify-center text-white">
                <RotateCcw size={16} />
              </div>
              <span className="text-[17px] text-slate-900 dark:text-white">{t('resetApp')}</span>
            </div>
            <ChevronRight size={20} className="text-slate-400" />
          </button>
        </div>
      </section>

      {/* About */}
      <section>
        <h3 className="text-[13px] font-medium text-slate-500 uppercase tracking-wide px-4 mb-2">
          About
        </h3>
        <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Languages size={24} />
            </div>
            <div>
              <p className="text-[17px] font-semibold text-slate-900 dark:text-white">Smart Reply Assist</p>
              <p className="text-[13px] text-slate-500">Version 1.0.3</p>
            </div>
          </div>
          <p className="text-[15px] text-slate-500 leading-relaxed">
            A premium enterprise translation and composition tool powered by advanced AI. 
            Designed for Manufacturing Excellence and global communication.
          </p>
        </div>
      </section>
    </div>
  );
};
