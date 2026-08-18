import { useState } from 'react';
import { ThemeMode, GlobalLanguage, AISettings, UserPreferences } from '../types';

/**
 * Props shared by SettingsPanelMobile and SettingsPanelDesktop. The two differ
 * only in layout, so they share this contract and the logic in useSettingsPanel.
 */
export interface SettingsPanelProps {
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  globalLanguage: GlobalLanguage;
  onLanguageChange: (lang: GlobalLanguage) => void;
  handleResetApp: () => void;
  handleClearHistory: () => void;
  settings: AISettings;
  onSaveSettings: (s: AISettings) => void;
  t: (key: string) => string;
  onOpenAdmin?: () => void;
  userPreferences: UserPreferences;
  onUserPreferencesChange: (prefs: UserPreferences) => void;
}

interface UseSettingsPanelParams {
  settings: AISettings;
  onSaveSettings: (s: AISettings) => void;
  globalLanguage: GlobalLanguage;
  t: (key: string) => string;
  onOpenAdmin?: () => void;
}

/**
 * State and handlers behind the settings panel, shared by both layouts.
 *
 * NOTE: handleFeedbackSubmit doubles as the admin unlock — typing the admin key
 * into the feedback box opens the dashboard instead of submitting. The key is
 * compared client-side against a VITE_ env var, so it ships in the bundle and
 * is not a real access control; the /api/admin/* routes remain unauthenticated.
 */
export function useSettingsPanel({
  settings,
  onSaveSettings,
  globalLanguage,
  t,
  onOpenAdmin
}: UseSettingsPanelParams) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const handleFeedbackSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    const inputKey = feedbackText.trim();
    const targetAdminKey = import.meta.env.VITE_ADMIN_SECRET_KEY || "MÃ_BẢO_MẬT_DỰ_PHÒNG_CỦA_BẠN";

    if (inputKey === targetAdminKey || inputKey === "MÃ_ADMIN_BẢO_MẬT_CỦA_BẠN") {
      // Stop the form from also submitting the key as feedback.
      if (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.nativeEvent) {
          (e.nativeEvent as any).stopImmediatePropagation();
        }
      }

      if (onOpenAdmin) onOpenAdmin();
      setFeedbackText('');
      setIsFeedbackOpen(false);
      return;
    }

    if (!inputKey) return;

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

  return {
    localSettings,
    isFeedbackOpen,
    setIsFeedbackOpen,
    feedbackText,
    setFeedbackText,
    isSubmittingFeedback,
    handleFeedbackSubmit,
    current,
    updateCurrent,
    themeOptions,
    languageOptions
  };
}
