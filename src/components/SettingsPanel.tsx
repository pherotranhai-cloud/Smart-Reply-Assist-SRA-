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
  Globe
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
  t
}) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string }[]>([]);
  const [manualMode, setManualMode] = useState(false);

  const current = localSettings.openai;

  const updateCurrent = (updates: Partial<typeof current>) => {
    const newSettings = {
      ...localSettings,
      openai: { ...current, ...updates }
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
        <h3 className="text-[13px] font-medium text-text-muted uppercase tracking-wide px-4 mb-2">
          {t('themeMode')}
        </h3>
        <div className="bg-panel rounded-xl overflow-hidden shadow-sm border border-border-main">
          <div className="p-3">
            <div className="flex bg-text-muted/10 rounded-lg p-1">
              {themeOptions.map((opt) => (
                <button
                  key={opt.mode}
                  onClick={() => onThemeChange(opt.mode)}
                  className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                    themeMode === opt.mode
                      ? 'bg-panel text-text-main shadow-sm'
                      : 'text-text-muted hover:text-text-main'
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
        <h3 className="text-[13px] font-medium text-text-muted uppercase tracking-wide px-4 mb-2">
          {t('interfaceLanguage')}
        </h3>
        <div className="bg-panel rounded-xl overflow-hidden shadow-sm border border-border-main">
          {languageOptions.map((opt, idx) => (
            <button
              key={opt.lang}
              onClick={() => onLanguageChange(opt.lang)}
              className={`w-full flex items-center justify-between px-4 py-3 bg-panel transition-colors hover:bg-border-main/20 ${
                idx !== languageOptions.length - 1 ? 'border-b border-border-main' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-white">
                  <Languages size={16} />
                </div>
                <span className="text-[17px] text-text-main">{opt.label}</span>
              </div>
              {globalLanguage === opt.lang ? (
                <span className="text-accent text-[17px]">✓</span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      {/* System Actions */}
      <section>
        <h3 className="text-[13px] font-medium text-text-muted uppercase tracking-wide px-4 mb-2">
          System
        </h3>
        <div className="bg-panel rounded-xl overflow-hidden shadow-sm border border-border-main">
          <button
            onClick={onReset}
            className="w-full flex items-center justify-between px-4 py-3 bg-panel transition-colors hover:bg-border-main/20"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-red-500 flex items-center justify-center text-white">
                <RotateCcw size={16} />
              </div>
              <span className="text-[17px] text-text-main">{t('resetApp')}</span>
            </div>
            <ChevronRight size={20} className="text-text-muted" />
          </button>
        </div>
      </section>

      {/* About */}
      <section>
        <h3 className="text-[13px] font-medium text-text-muted uppercase tracking-wide px-4 mb-2">
          About
        </h3>
        <div className="bg-panel rounded-xl overflow-hidden shadow-sm border border-border-main p-4">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-white shadow-sm">
              <Languages size={24} />
            </div>
            <div>
              <p className="text-[17px] font-semibold text-text-main">Smart Reply Assist</p>
              <p className="text-[13px] text-text-muted">Version 1.0.3</p>
            </div>
          </div>
          <p className="text-[15px] text-text-muted leading-relaxed">
            A premium enterprise translation and composition tool powered by advanced AI. 
            Designed for Manufacturing Excellence and global communication.
          </p>
        </div>
      </section>
    </div>
  );
};
