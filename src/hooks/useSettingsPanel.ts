import { useState } from 'react';
import { GlobalLanguage, AISettings, UserPreferences, UiTheme, SavedWallpaper } from '../types';
import { filesToScaledImages, MAX_SAVED_WALLPAPERS } from '../utils/imageResize';

/**
 * Props shared by SettingsPanelMobile and SettingsPanelDesktop. The two differ
 * only in layout, so they share this contract and the logic in useSettingsPanel.
 */
export interface SettingsPanelProps {
  globalLanguage: GlobalLanguage;
  onLanguageChange: (lang: GlobalLanguage) => void;
  handleResetApp: () => void;
  handleClearHistory: () => void;
  settings: AISettings;
  onSaveSettings: (s: AISettings) => void;
  t: (key: string) => string;
  /** Receives the key the server accepted, for the dashboard's own requests. */
  onOpenAdmin?: (adminKey: string) => void;
  userPreferences: UserPreferences;
  onUserPreferencesChange: (prefs: UserPreferences) => void;
}

interface UseSettingsPanelParams {
  settings: AISettings;
  onSaveSettings: (s: AISettings) => void;
  globalLanguage: GlobalLanguage;
  t: (key: string) => string;
  /** Receives the key the server accepted, for the dashboard's own requests. */
  onOpenAdmin?: (adminKey: string) => void;
}

// The dashboard's API host. Admin routes may live on the Render server rather
// than alongside the bundle, so the unlock probe has to ask the same origin the
// dashboard will, or a valid key would be checked against the wrong server.
const SERVER_BASE_URL = import.meta.env.VITE_RENDER_SERVER_URL || '';

/**
 * State and handlers behind the settings panel, shared by both layouts.
 *
 * handleFeedbackSubmit doubles as the admin unlock: what the user types is
 * first offered to /api/admin/metrics as an x-admin-key header. A 200 means the
 * server accepted it, so the dashboard opens and keeps the key for its own
 * requests; anything else falls through and the text is submitted as feedback.
 *
 * The comparison is deliberately the server's, not ours. It used to be done
 * here against VITE_ADMIN_SECRET_KEY — a VITE_ variable, so the secret was
 * compiled into every shipped bundle — while /api/admin/* accepted anyone who
 * knew the URL. The key now lives only in ADMIN_API_KEY on the server; see
 * shared/adminAuth.ts.
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

  /**
   * Cheap shape filter, not a security check — the server still decides. It
   * keeps genuine feedback, which runs to sentences and line breaks, out of a
   * request header, and saves a round trip on every real submission.
   */
  const couldBeKey = (text: string) => text.length <= 128 && !/\s/.test(text);

  /**
   * Offers the typed text to the admin endpoint as a key. True means the server
   * accepted it. A network failure is not an acceptance — it returns false and
   * the text goes on to be submitted as ordinary feedback.
   */
  const unlocksAdmin = async (candidate: string): Promise<boolean> => {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/metrics`, {
        headers: { 'x-admin-key': candidate },
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const handleFeedbackSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    const inputKey = feedbackText.trim();
    if (!inputKey) return;

    setIsSubmittingFeedback(true);
    if (couldBeKey(inputKey) && await unlocksAdmin(inputKey)) {
      // Stop the form from also submitting the key as feedback.
      if (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.nativeEvent) {
          (e.nativeEvent as any).stopImmediatePropagation();
        }
      }

      setIsSubmittingFeedback(false);
      if (onOpenAdmin) onOpenAdmin(inputKey);
      setFeedbackText('');
      setIsFeedbackOpen(false);
      return;
    }

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: feedbackText, lang: globalLanguage }),
      });
      // fetch only rejects on a network-level failure, so without this an HTTP
      // 500 — or a deploy with no /api/feedback route at all — took the success
      // path and thanked the user for feedback nobody stored.
      if (!response.ok) {
        throw new Error(`Feedback endpoint returned ${response.status}`);
      }
      setIsFeedbackOpen(false);
      setFeedbackText('');
      alert(t('feedbackSuccess'));
    } catch (err) {
      alert(t('feedbackError'));
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

  // The single theme control. 'system' follows the OS; the rest are palettes.
  // Settings previously had a separate Theme Mode row offering light/dark/
  // system, which wrote the same attribute and lost to this one on reload.
  const uiThemeOptions: { mode: UiTheme; key: string; label: string; emoji: string }[] = [
    { mode: 'system', key: 'personalization.theme.system', label: 'System', emoji: '🖥️' },
    { mode: 'light', key: 'personalization.theme.light', label: 'Light', emoji: '☀️' },
    { mode: 'dark', key: 'personalization.theme.dark', label: 'Dark', emoji: '🌙' },
    { mode: 'cyberpunk', key: 'personalization.theme.cyberpunk', label: 'Cyberpunk', emoji: '👾' },
    { mode: 'industrial', key: 'personalization.theme.industrial', label: 'Industrial', emoji: '⚙️' },
  ];

  const languageOptions: { lang: GlobalLanguage; label: string }[] = [
    { lang: 'en', label: 'English' },
    { lang: 'vi', label: 'Tiếng Việt' },
    { lang: 'zh-CN', label: '简体中文' },
    { lang: 'zh-TW', label: '繁體中文' },
  ];

  /**
   * Adds picked image files to the saved gallery, downscaled so they fit in
   * localStorage. Returns a message when something could not be added.
   *
   * Every message goes through t(). These strings used to be hardcoded
   * Vietnamese, so an English or Chinese user who hit the cap via upload got a
   * Vietnamese notice — the link path was localised, this one was missed
   * because the strings live in the hook rather than the component.
   */
  const addWallpaperFiles = async (
    files: FileList | File[],
    prefs: UserPreferences,
    onChange: (p: UserPreferences) => void
  ): Promise<string | null> => {
    // t() has no interpolation, so counts are substituted into the message.
    const fill = (key: string, values: Record<string, string | number>) =>
      Object.entries(values).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, String(value)),
        t(key)
      );

    const existing = prefs.savedWallpapers || [];
    const room = MAX_SAVED_WALLPAPERS - existing.length;
    if (room <= 0) return fill('personalization.limit_reached', { max: MAX_SAVED_WALLPAPERS });

    const { images, failed } = await filesToScaledImages(files);
    if (!images.length) {
      return failed.length ? fill('personalization.upload_unreadable', { files: failed.join(', ') }) : null;
    }

    const fresh = images.filter(img => !existing.some(w => w.url === img.dataUrl));
    const accepted = fresh.slice(0, room);
    const additions: SavedWallpaper[] = accepted.map(img => ({ url: img.dataUrl, name: img.name }));

    try {
      onChange({
        ...prefs,
        savedWallpapers: [...existing, ...additions],
        backgroundImage: additions.length ? additions[additions.length - 1].url : prefs.backgroundImage,
      });
    } catch {
      return t('personalization.storage_full');
    }

    const skipped = fresh.length - accepted.length;
    if (skipped > 0) {
      return fill('personalization.upload_partial_limit', {
        added: accepted.length,
        skipped,
        max: MAX_SAVED_WALLPAPERS,
      });
    }
    if (failed.length) {
      return fill('personalization.upload_partial_failed', {
        added: accepted.length,
        files: failed.join(', '),
      });
    }
    return null;
  };

  return {
    localSettings,
    uiThemeOptions,
    addWallpaperFiles,
    isFeedbackOpen,
    setIsFeedbackOpen,
    feedbackText,
    setFeedbackText,
    isSubmittingFeedback,
    handleFeedbackSubmit,
    current,
    updateCurrent,
    languageOptions
  };
}
