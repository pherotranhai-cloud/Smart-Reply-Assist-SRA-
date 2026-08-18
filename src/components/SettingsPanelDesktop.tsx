import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  RotateCcw,
  Languages,
  ChevronRight,
  Cpu,
  History,
  MessageSquareWarning,
  X,
  Send,
  Palette,
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';
import { SettingsPanelProps, useSettingsPanel } from '../hooks/useSettingsPanel';
import { APP_VERSION } from '../config/version';
import { SUPPORTED_MODELS } from '../constants';
import { DEFAULT_WALLPAPERS } from '../constants/wallpapers';

export const SettingsPanelDesktop: React.FC<SettingsPanelProps> = ({
  themeMode,
  onThemeChange,
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
    themeOptions,
    languageOptions
  } = useSettingsPanel({ settings, onSaveSettings, globalLanguage, t, onOpenAdmin });

  const hasBgImage = !!userPreferences?.backgroundImage || (userPreferences?.backgroundEffect && userPreferences.backgroundEffect !== 'none');

  return (
    <div className={`flex flex-col h-[calc(100vh-140px)] min-h-0 overflow-hidden w-full border border-border-main rounded-3xl p-6 transition-all duration-300 ${
      hasBgImage ? 'bg-panel/20 backdrop-blur-md' : 'bg-panel'
    }`}>
      <div className="flex-1 w-full overflow-y-auto pr-2 custom-scrollbar space-y-6">
        {/* Appearance */}
        <section>
          <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-widest px-4 mb-2">
            {t('themeMode')}
          </h3>
          <div className={`rounded-xl overflow-hidden shadow-sm border border-border-main transition-all duration-300 ${
            hasBgImage ? 'bg-panel/30' : 'bg-panel'
          }`}>
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

        {/* Personalization Section */}
        <section className="space-y-4">
          <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-widest px-4 mb-1 flex items-center gap-2">
            <Palette size={14} className="text-accent" />
            {t('settings.personalization') || 'Cá Nhân Hóa'}
          </h3>

          <div className={`rounded-xl p-4 shadow-sm border border-border-main space-y-5 transition-all duration-300 ${
            hasBgImage ? 'bg-panel/30' : 'bg-panel'
          }`}>
            {/* Theme Selector */}
            <div>
              <span className="text-[13px] font-medium text-text-muted mb-2 block">
                {t('personalization.theme') || 'Chủ đề giao diện'}
              </span>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { mode: 'light', key: 'personalization.theme.light', label: 'Light', emoji: '☀️' },
                  { mode: 'dark', key: 'personalization.theme.dark', label: 'Dark', emoji: '🌙' },
                  { mode: 'cyberpunk', key: 'personalization.theme.cyberpunk', label: 'Cyberpunk', emoji: '👾' },
                  { mode: 'industrial', key: 'personalization.theme.industrial', label: 'Industrial', emoji: '⚙️' }
                ].map((opt) => (
                  <button
                    key={opt.mode}
                    onClick={() => {
                      onUserPreferencesChange({
                        ...userPreferences,
                        theme: opt.mode as any
                      });
                    }}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all ${
                      userPreferences.theme === opt.mode
                        ? 'border-accent bg-accent/5 text-text-main font-semibold'
                        : 'border-border-main text-text-muted hover:border-text-muted/30 hover:text-text-main'
                    }`}
                  >
                    <span className="text-lg mb-1">{opt.emoji}</span>
                    <span className="text-[12px]">{t(opt.key) || opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Selector */}
            <div>
              <span className="text-[13px] font-medium text-text-muted mb-2 block">
                {t('personalization.font') || 'Phông chữ hệ thống'}
              </span>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'sans', key: 'personalization.font.sans', label: 'Sans (Standard)', style: 'font-sans' },
                  { id: 'mono', key: 'personalization.font.mono', label: 'Mono (Technical)', style: 'font-mono' },
                  { id: 'serif', key: 'personalization.font.serif', label: 'Serif (Classic)', style: 'font-serif' },
                  { id: 'playfair', key: 'personalization.font.playfair', label: 'Fancy (Playfair)', style: 'font-custom-fancy' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onUserPreferencesChange({
                        ...userPreferences,
                        fontFamily: opt.id as any
                      });
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      userPreferences.fontFamily === opt.id
                        ? 'border-accent bg-accent/5 text-text-main font-semibold'
                        : 'border-border-main text-text-muted hover:border-text-muted/30 hover:text-text-main'
                    }`}
                  >
                    <div className="text-[11px] text-text-muted mb-1 font-sans">Abc</div>
                    <div className={`text-[15px] truncate ${opt.style}`}>
                      {t(opt.key) || opt.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size Selector */}
            <div>
              <span className="text-[13px] font-medium text-text-muted mb-2 block">
                {t('personalization.fontSize') || 'Kích thước chữ'}
              </span>
              <div className="flex bg-text-muted/10 rounded-lg p-1 max-w-sm">
                {[
                  { id: 'sm', key: 'personalization.fontSize.sm', label: 'A-' },
                  { id: 'base', key: 'personalization.fontSize.base', label: 'A' },
                  { id: 'lg', key: 'personalization.fontSize.lg', label: 'A+' },
                  { id: 'xl', key: 'personalization.fontSize.xl', label: 'A++' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    title={t(opt.key)}
                    onClick={() => {
                      onUserPreferencesChange({
                        ...userPreferences,
                        fontSize: opt.id as any
                      });
                    }}
                    className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                      userPreferences.fontSize === opt.id
                        ? 'bg-panel text-text-main shadow-sm font-semibold'
                        : 'text-text-muted hover:text-text-main'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Background Image / Glassmorphic Preset Selector */}
            <div>
              <span className="text-[13px] font-medium text-text-muted mb-2 block flex items-center gap-1.5">
                <ImageIcon size={14} className="text-text-muted" />
                {t('personalization.background') || 'Hình nền & Kính mờ (Glassmorphism)'}
              </span>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: '', name: 'Mặc định', key: 'personalization.bg.default', style: 'bg-app border-border-main' },
                  ...DEFAULT_WALLPAPERS
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onUserPreferencesChange({
                        ...userPreferences,
                        backgroundImage: opt.id
                      });
                    }}
                    className={`flex flex-col h-16 rounded-xl border overflow-hidden p-2 justify-end relative transition-all ${
                      userPreferences.backgroundImage === opt.id
                        ? 'border-accent ring-2 ring-accent/20'
                        : 'border-border-main hover:border-text-muted/30'
                    }`}
                  >
                    {opt.id ? (
                      <img 
                        src={opt.id} 
                        alt={t(opt.key) || opt.name} 
                        referrerPolicy="no-referrer"
                        className="absolute inset-0 w-full h-full object-cover opacity-70"
                      />
                    ) : (
                      <div className="absolute inset-0 w-full h-full bg-panel" />
                    )}
                    <span className="text-[11px] font-medium text-white bg-black/40 px-1.5 py-0.5 rounded backdrop-blur-sm z-10 w-fit">
                      {t(opt.key) || opt.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Background URL input and Gallery */}
            <div className="pt-1">
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder={t('personalization.custom_bg_placeholder') || 'Dán link ảnh nền tùy chọn của bạn...'}
                  value={userPreferences.backgroundImage && !DEFAULT_WALLPAPERS.find(w => w.id === userPreferences.backgroundImage) && !userPreferences.savedWallpapers?.includes(userPreferences.backgroundImage) ? userPreferences.backgroundImage : ''}
                  onChange={(e) => {
                    onUserPreferencesChange({
                      ...userPreferences,
                      backgroundImage: e.target.value
                    });
                  }}
                  className="flex-1 text-[13px] px-3.5 py-2 rounded-xl bg-app text-text-main border border-border-main focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  onClick={() => {
                    if (userPreferences.backgroundImage && userPreferences.backgroundImage.trim() !== '') {
                      const url = userPreferences.backgroundImage.trim();
                      const currentSaved = userPreferences.savedWallpapers || [];
                      if (!currentSaved.includes(url)) {
                        onUserPreferencesChange({
                          ...userPreferences,
                          savedWallpapers: [...currentSaved, url]
                        });
                      }
                    }
                  }}
                  className="px-4 py-2 bg-accent text-white text-[13px] font-medium rounded-xl hover:bg-accent/90 transition-colors"
                >
                  {t('personalization.save_wallpaper') || 'Lưu'}
                </button>
              </div>

              {userPreferences.savedWallpapers && userPreferences.savedWallpapers.length > 0 && (
                <div className="mt-4">
                  <span className="text-[12px] font-medium text-text-muted mb-2 block">{t('personalization.saved_wallpapers') || 'Hình nền đã lưu'}</span>
                  <div className="grid grid-cols-4 gap-2">
                    {userPreferences.savedWallpapers.map((url, idx) => (
                      <div key={idx} className="relative group">
                        <button
                          onClick={() => {
                            onUserPreferencesChange({
                              ...userPreferences,
                              backgroundImage: url
                            });
                          }}
                          className={`w-full h-16 rounded-xl border overflow-hidden relative transition-all ${
                            userPreferences.backgroundImage === url
                              ? 'border-accent ring-2 ring-accent/20'
                              : 'border-border-main hover:border-text-muted/30'
                          }`}
                        >
                          <img 
                            src={url} 
                            alt="Saved wallpaper" 
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          {userPreferences.backgroundImage === url && (
                            <span className="absolute inset-x-0 bottom-0 text-[10px] text-center font-medium text-white bg-accent/80 py-0.5 z-10 backdrop-blur-sm">
                              {t('personalization.active_badge') || 'Đang dùng'}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newSaved = userPreferences.savedWallpapers.filter(w => w !== url);
                            onUserPreferencesChange({
                              ...userPreferences,
                              savedWallpapers: newSaved,
                              backgroundImage: userPreferences.backgroundImage === url ? '' : userPreferences.backgroundImage
                            });
                          }}
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-20"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Background Effects */}
            <div>
              <span className="text-[13px] font-medium text-text-muted mb-2 block flex items-center gap-1.5">
                <Sparkles size={14} className="text-text-muted" />
                {t('personalization.effects') || 'Hiệu ứng nền chuyển động'}
              </span>
              <div className="flex flex-wrap bg-text-muted/10 rounded-xl p-1 gap-1">
                {[
                  { id: 'none', label: 'Tắt', key: 'personalization.effect.none' },
                  { id: 'particles', label: 'Particles', key: 'personalization.effect.particles' },
                  { id: 'liquid', label: 'Liquid', key: 'personalization.effect.liquid' },
                  { id: 'aurora', label: 'Aurora', key: 'personalization.effect.aurora' },
                  { id: 'waves', label: 'Waves', key: 'personalization.effect.waves' }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onUserPreferencesChange({
                        ...userPreferences,
                        backgroundEffect: opt.id as any
                      });
                    }}
                    className={`flex-1 min-w-[70px] py-1.5 px-1 text-[12px] font-medium rounded-lg transition-all text-center ${
                      userPreferences.backgroundEffect === opt.id
                        ? 'bg-panel text-text-main shadow-sm font-semibold border border-border-main/50'
                        : 'text-text-muted hover:text-text-main hover:bg-black/5'
                    }`}
                  >
                    {t(opt.key) || opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* AI Model Section */}
        <section>
          <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-widest px-4 mb-2 flex items-center gap-2">
            <Cpu size={14} className="text-accent" />
            {t('model')}
          </h3>
          <div className={`rounded-xl overflow-hidden shadow-sm border border-border-main p-3 transition-all duration-300 ${
            hasBgImage ? 'bg-panel/30 backdrop-blur-sm' : 'bg-panel'
          }`}>
            <div className="grid grid-cols-2 gap-2">
              {SUPPORTED_MODELS.map((modelId) => (
                <button
                  key={modelId}
                  onClick={() => updateCurrent({ model: modelId })}
                  className={`w-full flex flex-col p-3 rounded-xl border text-left transition-all ${
                    localSettings.openai.model === modelId
                      ? 'border-accent bg-accent/5 text-text-main font-semibold'
                      : 'border-border-main text-text-muted hover:border-text-muted/30 hover:text-text-main'
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="text-[15px]">{modelId === 'gpt-5.6-luna' ? 'GPT-5.6 Luna' : modelId}</span>
                    {localSettings.openai.model === modelId && (
                      <span className="text-accent text-[15px]">✓</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Language */}
        <section>
          <h3 className="text-[11px] font-medium text-slate-400 uppercase tracking-widest px-4 mb-2">
            {t('interfaceLanguage')}
          </h3>
          <div className={`rounded-xl overflow-hidden shadow-sm border border-border-main transition-all duration-300 ${
            hasBgImage ? 'bg-panel/30' : 'bg-panel'
          }`}>
            {languageOptions.map((opt, idx) => (
              <button
                key={opt.lang}
                onClick={() => onLanguageChange(opt.lang)}
                className={`w-full flex items-center justify-between px-4 py-3 bg-transparent transition-colors hover:bg-border-main/20 ${
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
            {t('supportFeedback')}
          </h3>
          <div className={`rounded-xl overflow-hidden shadow-sm border border-border-main transition-all duration-300 ${
            hasBgImage ? 'bg-panel/30' : 'bg-panel'
          }`}>
            <button
              onClick={() => setIsFeedbackOpen(true)}
              className="w-full flex items-center justify-between px-4 py-3 bg-transparent transition-colors hover:bg-border-main/20"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-white">
                  <MessageSquareWarning size={16} />
                </div>
                <span className="text-[17px] text-text-main">{t('feedbackErrorReport')}</span>
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
          <div className={`rounded-xl overflow-hidden shadow-sm border border-border-main transition-all duration-300 ${
            hasBgImage ? 'bg-panel/30' : 'bg-panel'
          }`}>
            <button
              onClick={handleResetApp}
              className="w-full flex items-center justify-between px-4 py-3 bg-transparent transition-colors hover:bg-border-main/20 border-b border-border-main"
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
              onClick={handleClearHistory}
              className="w-full flex items-center justify-between px-4 py-3 bg-transparent transition-colors hover:bg-border-main/20"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center text-white">
                  <History size={16} />
                </div>
                <span className="text-[17px] text-red-500 font-medium">{t('clearHistory')}</span>
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
          <div className={`rounded-xl overflow-hidden shadow-sm border border-border-main p-4 transition-all duration-300 ${
            hasBgImage ? 'bg-panel/30' : 'bg-panel'
          }`}>
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
      </div>

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
              <div className="p-4 border-b border-border-main flex justify-between items-center bg-panel">
                <h3 className="text-lg font-semibold text-text-main flex items-center gap-2">
                  <MessageSquareWarning size={20} className="text-accent" />
                  {t('feedback_error_report') || 'Góp ý & Báo lỗi'}
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
                  {t('feedback_subtext') || 'Chúng tôi luôn lắng nghe để cải thiện ứng dụng tốt hơn. Cảm ơn bạn!'}
                </p>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder={t('feedback_placeholder') || 'Nhập nội dung góp ý hoặc báo lỗi...'}
                  className="w-full h-32 resize-none rounded-xl p-3 bg-app text-text-main border border-border-main focus:ring-2 focus:ring-accent/20 focus:outline-none transition-all text-sm"
                />
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={!feedbackText.trim() || isSubmittingFeedback}
                  className="w-full py-3 bg-accent hover:bg-accent/90 text-white font-semibold rounded-xl transition-colors shadow-sm shadow-accent/20 flex justify-center items-center gap-2 disabled:opacity-50 disabled:shadow-none text-sm"
                >
                  {isSubmittingFeedback ? (
                    t('sending') || 'Đang gửi...'
                  ) : (
                    <>
                      <Send size={18} />
                      {t('send_feedback') || 'Gửi góp ý'}
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
