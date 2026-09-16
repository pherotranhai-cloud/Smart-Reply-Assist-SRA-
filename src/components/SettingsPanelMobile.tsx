import React from 'react';
import { SettingsPanelProps, useSettingsPanel } from '../hooks/useSettingsPanel';
import { SettingsPageHeader } from './settings/SettingsPageHeader';
import { ThemeSection } from './settings/ThemeSection';
import { TypographySection } from './settings/TypographySection';
import { WallpaperSection } from './settings/WallpaperSection';
import { BackgroundEffectsSection } from './settings/BackgroundEffectsSection';
import { ModelSection } from './settings/ModelSection';
import { LanguageSection } from './settings/LanguageSection';
import { FeedbackSection } from './settings/FeedbackSection';
import { FeedbackSheet } from './settings/FeedbackSheet';
import { SystemSection } from './settings/SystemSection';
import { AboutSection } from './settings/AboutSection';

/**
 * Each section owns its own grouped-list card, header and footer, so this file
 * is only the page scaffold and the prop wiring. The desktop panel renders the
 * same sections inside its own pane.
 */
export const SettingsPanelMobile: React.FC<SettingsPanelProps> = ({
  globalLanguage,
  onLanguageChange,
  handleResetApp,
  handleClearHistory,
  settings,
  onSaveSettings,
  t,
  onOpenAdmin,
  userPreferences,
  onUserPreferencesChange
}) => {
  const {
    localSettings,
    isFeedbackOpen,
    setIsFeedbackOpen,
    feedbackText,
    setFeedbackText,
    isSubmittingFeedback,
    handleFeedbackSubmit,
    updateCurrent,
    uiThemeOptions,
    addWallpaperFiles,
    languageOptions
  } = useSettingsPanel({ settings, onSaveSettings, globalLanguage, t, onOpenAdmin });

  return (
    <div className="font-sans space-y-9 pb-[calc(6rem_+_env(safe-area-inset-bottom))]">
      <SettingsPageHeader t={t} />

      <ThemeSection
        uiThemeOptions={uiThemeOptions}
        userPreferences={userPreferences}
        onUserPreferencesChange={onUserPreferencesChange}
        t={t}
      />

      <TypographySection
        userPreferences={userPreferences}
        onUserPreferencesChange={onUserPreferencesChange}
        t={t}
      />

      <WallpaperSection
        userPreferences={userPreferences}
        onUserPreferencesChange={onUserPreferencesChange}
        addWallpaperFiles={addWallpaperFiles}
        t={t}
      />

      <BackgroundEffectsSection
        userPreferences={userPreferences}
        onUserPreferencesChange={onUserPreferencesChange}
        t={t}
      />

      <ModelSection
        model={localSettings.openai.model}
        onSelectModel={(model) => updateCurrent({ model })}
        t={t}
      />

      <LanguageSection
        languageOptions={languageOptions}
        globalLanguage={globalLanguage}
        onLanguageChange={onLanguageChange}
        t={t}
      />

      <FeedbackSection t={t} onOpen={() => setIsFeedbackOpen(true)} />

      <SystemSection
        t={t}
        handleResetApp={handleResetApp}
        handleClearHistory={handleClearHistory}
      />

      <AboutSection t={t} />

      <FeedbackSheet
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        feedbackText={feedbackText}
        setFeedbackText={setFeedbackText}
        isSubmitting={isSubmittingFeedback}
        onSubmit={handleFeedbackSubmit}
        t={t}
      />
    </div>
  );
};
