import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  Globe,
  History,
  MessageSquareWarning,
  X,
  Send
} from 'lucide-react';
import { ThemeMode, GlobalLanguage, AISettings } from '../types';
import { AIService } from '../services/ai';
import { APP_VERSION } from '../config/version';

interface SettingsPanelProps {
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  globalLanguage: GlobalLanguage;
  onLanguageChange: (lang: GlobalLanguage) => void;
  onReset: () => void;
  onClearHistory?: () => void;
  settings: AISettings;
  onSaveSettings: (s: AISettings) => void;
  t: (key: string) => string;
  onOpenAdmin?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  themeMode,
  onThemeChange,
  globalLanguage,
  onLanguageChange,
  onReset,
  onClearHistory,
  settings,
  onSaveSettings,
  t,
  onOpenAdmin
}) => {
  const [localSettings, setLocalSettings] = useState(settings);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string }[]>([]);
  const [manualMode, setManualMode] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const handleFeedbackSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    const text = feedbackText;
    const adminSecret = import.meta.env.VITE_ADMIN_SECRET_KEY || "";
    if (text.trim() === adminSecret || text.trim() === "MÃ_ADMIN_BẢO_MẬT_CỦA_BẠN") {
      if (onOpenAdmin) onOpenAdmin();
      setIsFeedbackOpen(false);
      setFeedbackText('');
      return; // Thoát ngay lập tức, chặn đứng luồng ghi xuống bảng feedback thông thường
    }

    if (!text.trim()) return;
    
    setIsSubmittingFeedback(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: feedbackText, lang: globalLanguage }),
      });
      setIsFeedbackOpen(false);
      setFeedbackText('');
      alert(t('feedbackSuccess') || 'Cảm ơn bạn đã góp ý!');
    } catch (err) {
      alert(t('feedbackError') || 'Gửi góp ý thất bại. Vui lòng thử lại sau.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

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
    { mode: 'light', label: t('light') },
    { mode: 'dark', label: t('dark') },
    { mode: 'system', label: t('systemTheme') },
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
        <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-widest px-4 mb-2">
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
        <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-widest px-4 mb-2">
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

      {/* Feedback & Support */}
      <section>
        <h3 className="text-[12px] font-medium text-slate-400 uppercase tracking-widest px-4 mb-2">
          Hỗ trợ & Phản hồi
        </h3>
        <div className="bg-panel rounded-xl overflow-hidden shadow-sm border border-border-main">
          <button
            onClick={() => setIsFeedbackOpen(true)}
            className="w-full flex items-center justify-between px-4 py-3 bg-panel transition-colors hover:bg-border-main/20"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-white">
                <MessageSquareWarning size={16} />
              </div>
              <span className="text-[17px] text-text-main">Góp ý & Báo lỗi</span>
            </div>
            <ChevronRight size={20} className="text-text-muted" />
          </button>
        </div>
      </section>

      {/* System Actions */}
      <section>
        <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-widest px-4 mb-2">
          {t('system')}
        </h3>
        <div className="bg-panel rounded-xl overflow-hidden shadow-sm border border-border-main">
          <button
            onClick={onReset}
            className="w-full flex items-center justify-between px-4 py-3 bg-panel transition-colors hover:bg-border-main/20 border-b border-border-main"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-red-500 flex items-center justify-center text-white">
                <RotateCcw size={16} />
              </div>
              <span className="text-[17px] text-text-main">{t('resetApp')}</span>
            </div>
            <ChevronRight size={20} className="text-text-muted" />
          </button>
          
          <button
            onClick={() => {
              if (window.confirm(t('confirmClearHistory') || 'Are you sure you want to clear all history?')) {
                onClearHistory?.();
              }
            }}
            className="w-full flex items-center justify-between px-4 py-3 bg-panel transition-colors hover:bg-border-main/20"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center text-white">
                <History size={16} />
              </div>
              <span className="text-[17px] text-red-500 font-medium">{t('clearHistory') || 'Clear History'}</span>
            </div>
            <ChevronRight size={20} className="text-text-muted" />
          </button>
        </div>
      </section>

      {/* About */}
      <section>
        <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-widest px-4 mb-2">
          {t('about')}
        </h3>
        <div className="bg-panel rounded-xl overflow-hidden shadow-sm border border-border-main p-4">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-white shadow-sm">
              <Languages size={24} />
            </div>
            <div>
              <p className="text-[17px] font-semibold text-text-main">{t('appName')}</p>
              <p className="text-[13px] text-text-muted">Phiên bản {APP_VERSION}</p>
            </div>
          </div>
          <p className="text-[15px] text-text-muted leading-relaxed">
            {t('appDescription')}
          </p>
        </div>
      </section>

      {/* Feedback Modal */}
      <AnimatePresence>
        {isFeedbackOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-panel border border-border-main rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative"
            >
              <div className="p-4 border-b border-border-main flex justify-between items-center bg-bg-input">
                <h3 className="text-lg font-semibold text-text-main flex items-center gap-2">
                  <MessageSquareWarning size={20} className="text-accent" />
                  Góp ý & Báo lỗi
                </h3>
                <button 
                  onClick={() => setIsFeedbackOpen(false)}
                  className="p-1 rounded-lg hover:bg-border-main/50 text-text-muted"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-[14px] text-text-muted">
                  Chúng tôi luôn lắng nghe để cải thiện ứng dụng tốt hơn. Cảm ơn bạn!
                </p>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Nhập nội dung góp ý hoặc báo lỗi..."
                  className="saas-input w-full h-32 resize-none"
                />
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={!feedbackText.trim() || isSubmittingFeedback}
                  className="saas-button primary-button w-full flex justify-center items-center gap-2"
                >
                  {isSubmittingFeedback ? (
                    'Đang gửi...'
                  ) : (
                    <>
                      <Send size={18} />
                      Gửi góp ý
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
