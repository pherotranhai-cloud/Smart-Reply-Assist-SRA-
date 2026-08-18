import React from 'react';
import { Search, Download, BookOpen, Clock, Volume2 } from 'lucide-react';
import { useVocabManager } from '../hooks/useVocabManager';

interface VocabManagerDesktopProps {
  t: (key: string) => string;
  userPreferences?: any;
}

export const VocabManagerDesktop: React.FC<VocabManagerDesktopProps> = ({ t, userPreferences }) => {
  const {
    search, setSearch, loading, lastSynced,
    filteredVocab, handleExport, speakText,
  } = useVocabManager();

  const hasBgImage = !!userPreferences?.backgroundImage || (userPreferences?.backgroundEffect && userPreferences.backgroundEffect !== 'none');

  return (
    <div className={`flex flex-col h-[calc(100vh-140px)] min-h-0 overflow-hidden w-full border border-border-main rounded-3xl p-6 justify-between transition-all duration-300 ${
      hasBgImage ? 'bg-panel/20 backdrop-blur-md' : 'bg-panel'
    }`}>
      {/* Header section (fixed at the top) */}
      <div className="flex items-center justify-between pb-4 border-b border-border-main flex-shrink-0">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold text-text-main flex items-center gap-3">
            <BookOpen className="text-accent" size={28} />
            {t('vocab')}
          </h2>
          {lastSynced && (
            <p className="text-sm text-text-muted flex items-center gap-1.5">
              <Clock size={14} /> {t('last_synced')}: {lastSynced}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input 
              type="text" 
              placeholder={t('searchVocab')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 border border-border-main rounded-xl text-sm focus:ring-2 focus:ring-accent/20 outline-none transition-all text-text-main ${
                hasBgImage ? 'bg-panel/30' : 'bg-app'
              }`}
            />
          </div>
          <button 
            onClick={handleExport}
            className={`flex items-center gap-2 px-4 py-2.5 border border-border-main text-text-main hover:bg-app/50 rounded-xl text-sm font-medium transition-colors ${
              hasBgImage ? 'bg-panel/30' : 'bg-app'
            }`}
          >
            <Download size={18} />
            <span>{t('export_csv')}</span>
          </button>
        </div>
      </div>

      {/* Vùng chứa Grid Card Từ Vựng */}
      <div className="flex-1 w-full overflow-y-auto my-4 pr-2 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-muted py-12">
            {t('loading')}...
          </div>
        ) : filteredVocab.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-50 py-12">
            <BookOpen size={48} className="mb-4" />
            <p className="text-xl">{t('vocab_empty')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredVocab.map((item, idx) => (
              <div 
                key={`${item.id || idx}-${idx}`} 
                className={`border border-border-main rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col gap-4 group relative ${
                  hasBgImage ? 'bg-panel/30' : 'bg-app'
                }`}
              >
                {/* Term header */}
                <div className="flex items-start justify-between border-b border-border-main pb-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold text-accent uppercase tracking-widest">{t('term')}</span>
                    <span className="font-bold text-text-main text-base">{item.term}</span>
                  </div>
                  <button
                    onClick={() => speakText(item.vi || item.term, 'vi-VN')}
                    className="p-2 text-text-muted hover:text-accent hover:bg-accent/10 rounded-xl transition-colors"
                    title={t('pronounce')}
                  >
                    <Volume2 size={16} />
                  </button>
                </div>

                {/* Translations list */}
                <div className="flex flex-col gap-2">
                  {item.vi && (
                    <div 
                      onClick={() => speakText(item.vi, 'vi-VN')}
                      className="flex items-center justify-between text-xs bg-panel/50 px-3 py-1.5 rounded-xl border border-border-main/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                      title="Click to pronounce in Vietnamese"
                    >
                      <span className="font-semibold text-text-muted">🇻🇳 VI</span>
                      <span className="font-medium text-text-main text-right truncate pl-2" title={item.vi}>{item.vi}</span>
                    </div>
                  )}
                  {item.en && (
                    <div 
                      onClick={() => speakText(item.en, 'en-US')}
                      className="flex items-center justify-between text-xs bg-panel/50 px-3 py-1.5 rounded-xl border border-border-main/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                      title="Click to pronounce in English"
                    >
                      <span className="font-semibold text-text-muted">🇬🇧 EN</span>
                      <span className="font-medium text-text-main text-right truncate pl-2" title={item.en}>{item.en}</span>
                    </div>
                  )}
                  {(item.zh_cn || item.zh_tw) && (
                    <div 
                      onClick={() => speakText(item.zh_cn || item.zh_tw || '', 'zh-CN')}
                      className="flex items-center justify-between text-xs bg-panel/50 px-3 py-1.5 rounded-xl border border-border-main/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                      title="Click to pronounce in Chinese"
                    >
                      <span className="font-semibold text-text-muted">🇨🇳 ZH</span>
                      <span className="font-medium text-text-main text-right truncate pl-2" title={item.zh_cn || item.zh_tw}>{item.zh_cn || item.zh_tw}</span>
                    </div>
                  )}
                  {item.id_lang && (
                    <div 
                      onClick={() => speakText(item.id_lang, 'id-ID')}
                      className="flex items-center justify-between text-xs bg-panel/50 px-3 py-1.5 rounded-xl border border-border-main/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                      title="Click to pronounce in Indonesian"
                    >
                      <span className="font-semibold text-text-muted">🇮🇩 ID</span>
                      <span className="font-medium text-text-main text-right truncate pl-2" title={item.id_lang}>{item.id_lang}</span>
                    </div>
                  )}
                  {item.my && (
                    <div 
                      onClick={() => speakText(item.my, 'my-MM')}
                      className="flex items-center justify-between text-xs bg-panel/50 px-3 py-1.5 rounded-xl border border-border-main/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                      title="Click to pronounce in Burmese"
                    >
                      <span className="font-semibold text-text-muted">🇲🇲 MY</span>
                      <span className="font-medium text-text-main text-right truncate pl-2" title={item.my}>{item.my}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
