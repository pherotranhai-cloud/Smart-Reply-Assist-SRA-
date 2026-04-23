import React, { useState, useEffect } from 'react';
import { X, FileText, FileSearch, Clock, HelpCircle, Megaphone, Settings2 } from 'lucide-react';
import { CORE_PRESETS, AUDIENCES, TONES, LENGTHS, FORMATS, ComposePreset, LANGUAGES, LANGUAGE_FLAGS } from '../../constants';
import { Audience, Tone, Length, Format, Language } from '../../types';
import { useLongPress } from '../../hooks/useLongPress';

const ICON_MAP: Record<string, React.ElementType> = {
  FileText,
  FileSearch,
  Clock,
  HelpCircle,
  Megaphone,
  Settings2
};

interface PresetGridProps {
  activePresetId: string;
  onSelectPreset: (preset: ComposePreset) => void;
  customParams: {
    audience: Audience;
    tone: Tone;
    length: Length;
    format: Format;
    lang: Language;
  };
  onUpdateCustomParams: (params: any) => void;
  t: (key: string) => string;
}

export const PresetGrid: React.FC<PresetGridProps> = ({
  activePresetId,
  onSelectPreset,
  customParams,
  onUpdateCustomParams,
  t
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [localCustom, setLocalCustom] = useState(customParams);

  useEffect(() => {
    const saved = localStorage.getItem('sra_custom_preset');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setLocalCustom(prev => ({ ...prev, ...parsed }));
        if (activePresetId === 'custom') {
           onUpdateCustomParams(parsed);
        }
      } catch (e) {
        console.error('Failed to parse custom preset', e);
      }
    }
  }, []);

  const handleSaveCustom = () => {
    localStorage.setItem('sra_custom_preset', JSON.stringify(localCustom));
    onUpdateCustomParams(localCustom);
    onSelectPreset(CORE_PRESETS.find(p => p.id === 'custom')!);
    setIsModalOpen(false);
  };

  const activeConfig = CORE_PRESETS.find(p => p.id === activePresetId) || CORE_PRESETS[5];
  const currentSettings = activePresetId === 'custom' ? localCustom : activeConfig.settings;

  const longPressProps = useLongPress(() => {
      setIsModalOpen(true);
  }, () => {
      onSelectPreset(CORE_PRESETS.find(p => p.id === 'custom')!);
  }, { delay: 400 });

  return (
    <div className="space-y-4">
      {/* 6 Icons Grid */}
      <div className="grid grid-cols-6 gap-2">
        {CORE_PRESETS.map((preset) => {
          const isActive = activePresetId === preset.id;
          const isCustom = preset.id === 'custom';
          const IconComponent = ICON_MAP[preset.iconName] || FileText;
          
          const buttonProps = isCustom ? longPressProps : {
              onClick: () => onSelectPreset(preset)
          };

          return (
            <button
              key={preset.id}
              {...buttonProps}
              title={preset.name}
              className={`w-full aspect-square flex items-center justify-center rounded-2xl transition-all duration-300 ${
                isActive
                  ? 'bg-accent/10 border-2 border-accent text-accent shadow-md shadow-accent/20'
                  : 'bg-transparent border-2 border-slate-200/20 text-text-muted opacity-60 hover:opacity-100 hover:bg-slate-100/10'
              }`}
            >
               <IconComponent size={24} strokeWidth={isActive ? 2.5 : 1.5} />
            </button>
          );
        })}
      </div>

      {/* Subtext Note */}
      <div className="text-center animate-in fade-in duration-300">
         <p className="text-[12px] text-text-muted mt-1 font-medium tracking-wide">
             {t(AUDIENCES.find(a => a.value === currentSettings.audience)?.labelKey || '')} &bull; {t(TONES.find(a => a.value === currentSettings.tone)?.labelKey || '')} &bull; {t(LENGTHS.find(a => a.value === currentSettings.length)?.labelKey || '')}
         </p>
      </div>

      {/* Language Selection */}
      <div className="mt-3">
        <label className="text-[12px] font-medium text-text-muted px-1">{t('language')}</label>
        <select 
          className="w-full mt-1 bg-panel text-text-main border border-border-main rounded-xl px-3 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-accent transition-colors duration-300"
          value={customParams.lang}
          onChange={e => onUpdateCustomParams({ lang: e.target.value as Language })}
        >
          {LANGUAGES.filter(l => l !== 'Auto').map(l => <option key={l} value={l}>{LANGUAGE_FLAGS[l]} {l}</option>)}
        </select>
      </div>

      {/* Custom Parameters Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-panel border border-border-main rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-border-main">
              <h3 className="font-semibold text-text-main text-lg">Cấu hình Tùy chỉnh (Custom)</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-text-muted hover:text-red-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-text-muted">{t('audience')}</label>
                <select 
                  className="w-full bg-surface text-text-main border border-border-main rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent"
                  value={localCustom.audience}
                  onChange={e => setLocalCustom({ ...localCustom, audience: e.target.value as Audience })}
                >
                  {AUDIENCES.map(a => <option key={a.value} value={a.value}>{t(a.labelKey)}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-text-muted">{t('tone')}</label>
                <select 
                  className="w-full bg-surface text-text-main border border-border-main rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent"
                  value={localCustom.tone}
                  onChange={e => setLocalCustom({ ...localCustom, tone: e.target.value as Tone })}
                >
                  {TONES.map(to => <option key={to.value} value={to.value}>{t(to.labelKey)}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-text-muted">Độ dài (Length)</label>
                <select 
                  className="w-full bg-surface text-text-main border border-border-main rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent"
                  value={localCustom.length}
                  onChange={e => setLocalCustom({ ...localCustom, length: e.target.value as Length })}
                >
                  {LENGTHS.map(l => <option key={l.value} value={l.value}>{t(l.labelKey)}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-medium text-text-muted">{t('format')}</label>
                <select 
                  className="w-full bg-surface text-text-main border border-border-main rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-accent"
                  value={localCustom.format}
                  onChange={e => setLocalCustom({ ...localCustom, format: e.target.value as Format })}
                >
                  {FORMATS.map(f => <option key={f.value} value={f.value}>{t(f.labelKey)}</option>)}
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-border-main bg-surface/50 flex justify-end gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-text-main hover:bg-slate-500/10 transition-colors font-medium"
              >
                Hủy
              </button>
              <button 
                onClick={handleSaveCustom}
                className="px-4 py-2 bg-accent text-white rounded-xl hover:bg-accent/90 transition-colors font-medium shadow-md shadow-accent/20"
              >
                Lưu & Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
