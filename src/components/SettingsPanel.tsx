import React from 'react';
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
  Database
} from 'lucide-react';
import { ThemeMode, GlobalLanguage } from '../types';

interface SettingsPanelProps {
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  globalLanguage: GlobalLanguage;
  onLanguageChange: (lang: GlobalLanguage) => void;
  onReset: () => void;
  t: (key: string) => string;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  themeMode,
  onThemeChange,
  globalLanguage,
  onLanguageChange,
  onReset,
  t
}) => {
  const themeOptions: { mode: ThemeMode; icon: React.ReactNode; label: string }[] = [
    { mode: 'light', icon: <Sun size={18} />, label: 'Light' },
    { mode: 'dark', icon: <Moon size={18} />, label: 'Dark' },
    { mode: 'system', icon: <Monitor size={18} />, label: 'System' },
  ];

  const languageOptions: { lang: GlobalLanguage; label: string }[] = [
    { lang: 'en', label: 'English' },
    { lang: 'vi', label: 'Tiếng Việt' },
    { lang: 'zh-CN', label: '简体中文' },
    { lang: 'zh-TW', label: '繁體中文' },
  ];

  return (
    <div className="space-y-6">
      {/* Appearance */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted px-1">
          {t('themeMode')}
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => onThemeChange(opt.mode)}
              className={`flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all ${
                themeMode === opt.mode
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-muted/5 border-border-main/50 text-muted hover:bg-muted/10'
              }`}
            >
              {opt.icon}
              <span className="text-xs font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Language */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted px-1">
          {t('interfaceLanguage')}
        </h3>
        <div className="glass-panel overflow-hidden">
          {languageOptions.map((opt, idx) => (
            <button
              key={opt.lang}
              onClick={() => onLanguageChange(opt.lang)}
              className={`w-full flex items-center justify-between p-4 transition-colors ${
                idx !== languageOptions.length - 1 ? 'border-b border-border-main/50' : ''
              } ${
                globalLanguage === opt.lang ? 'bg-primary/5 text-primary' : 'hover:bg-muted/5'
              }`}
            >
              <span className="text-sm font-medium">{opt.label}</span>
              {globalLanguage === opt.lang && (
                <div className="w-2 h-2 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* System Actions */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted px-1">
          System
        </h3>
        <div className="glass-panel overflow-hidden">
          <button
            onClick={onReset}
            className="w-full flex items-center gap-3 p-4 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <RotateCcw size={18} />
            <span className="text-sm font-medium flex-1 text-left">{t('resetApp')}</span>
            <ChevronRight size={16} className="opacity-30" />
          </button>
        </div>
      </section>

      {/* About */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted px-1">
          About
        </h3>
        <div className="glass-panel p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Languages size={20} />
            </div>
            <div>
              <p className="text-sm font-bold">Smart Reply Assist</p>
              <p className="text-xs text-muted">Version 1.0.3</p>
            </div>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            A premium enterprise translation and composition tool powered by advanced AI. 
            Designed for Manufacturing Excellence and global communication.
          </p>
        </div>
      </section>
    </div>
  );
};
