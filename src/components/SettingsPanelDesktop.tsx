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
 * Same sections as the mobile panel, inside the desktop pane. The pane itself
 * scrolls, so the header runs in its 'pane' variant.
 */
export const SettingsPanelDesktop: React.FC<SettingsPanelProps> = ({
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

  // Over a wallpaper the pane uses --surface-solid rather than a fractional
  // alpha: --bg-card is already translucent, so bg-panel/20 composited to ~0.17.
  const hasBgImage = !!userPreferences?.backgroundImage || (userPreferences?.backgroundEffect && userPreferences.backgroundEffect !== 'none');

  return (
    <div className={`flex flex-col h-[calc(100vh-140px)] min-h-0 overflow-hidden w-full border border-border-main rounded-3xl px-6 pb-6 transition-all duration-300 ${
      hasBgImage ? 'bg-surface backdrop-blur-md' : 'bg-panel'
    }`}>
      <div className="flex-1 w-full overflow-y-auto pr-2 space-y-9">
        <SettingsPageHeader t={t} variant="pane" />

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
      </div>

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
