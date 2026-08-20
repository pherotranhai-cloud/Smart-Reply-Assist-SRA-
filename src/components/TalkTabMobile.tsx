import React from 'react';
import { Mic, Square, Save, ChevronDown, Share2 } from 'lucide-react';
import { LANGUAGE_FLAGS } from '../constants';
import { useTalkTab } from '../hooks/useTalkTab';

const ALL_LANGUAGES = ['Vietnamese', 'Chinese (Simplified)', 'Chinese (Traditional)', 'English', 'Indonesian', 'Burmese'] as const;

interface TalkTabProps {
  settings: any;
  vocab: any[];
  t: (key: string) => string;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const TalkTabMobile: React.FC<TalkTabProps> = ({ settings, vocab, t, showToast }) => {
  const {
    myLang,
    setMyLang,
    usedSeconds,
    QUOTA_LIMIT,
    isListening,
    sourceSubtitle,
    targetSubtitle,
    isInitializing,
    connectionProgress,
    currentTriviaKey,
    scrollRef,
    isLimitReached,
    handleMicClick,
    handleSaveHistory,
    handleNativeShare,
    conversationLog,
  } = useTalkTab({ t, showToast });

  return (
    <div className="flex flex-col h-full bg-surface backdrop-blur-xl shadow-sm border border-border-main rounded-3xl overflow-hidden relative pb-4">
      
      <div className="flex items-center justify-between p-4 border-b border-border-main bg-panel z-10">
        <div className="flex items-center gap-2">
           <Mic size={18} className="text-accent-text" />
           <span className="text-sm font-semibold text-text-main opacity-80">
             {t('live_translator') || 'Live Translator'}
           </span>
        </div>
        
        {/* Dropdown Ngôn ngữ chuyển lên đây */}
        <div className="relative">
          {/* Nút hiển thị giao diện giả lập sang trọng, tinh tế giống hệt cũ */}
          <div className="flex items-center gap-1 text-xs font-semibold text-accent-text bg-accent/10 px-3 py-1.5 rounded-full pointer-events-none">
            <span>{LANGUAGE_FLAGS[myLang as keyof typeof LANGUAGE_FLAGS]} {myLang.split(' ')[0]}</span>
            <ChevronDown size={14} />
          </div>
          
          {/* Thẻ select native ẩn hoàn toàn, nằm đè lên trên cùng để đón nhận tương tác nhấn */}
          <select
            value={myLang}
            onChange={(e) => {
              const selectedLang = e.target.value;
              setMyLang(selectedLang);
            }}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-20"
          >
            {ALL_LANGUAGES.map(lang => (
              <option key={lang} value={lang}>
                {LANGUAGE_FLAGS[lang]} {lang}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-6 flex flex-col pt-6 pb-4 relative">
        
        {/* Progress & Trivia (when initializing) */}
        {isInitializing && (
          <div className="absolute top-4 left-0 right-0 z-10 px-6 flex flex-col items-center">
            <div className="w-full max-w-sm h-1 bg-border-main rounded-full overflow-hidden mb-2">
              <div 
                className="h-full bg-accent transition-all duration-100 ease-linear"
                style={{ width: `${connectionProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-text-muted opacity-80 animate-pulse text-center max-w-xs">
              {t(currentTriviaKey)}
            </p>
          </div>
        )}

        {isListening || sourceSubtitle || targetSubtitle || conversationLog.length > 0 ? (
          <div ref={scrollRef} className="flex-grow w-full max-h-[52vh] overflow-y-auto scroll-smooth pr-2 custom-scrollbar flex flex-col gap-6 items-center justify-center">
            <div className="w-full text-center space-y-1">
               <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">{t('talk_source_audio') || 'Source'}</p>
               <p className="text-lg md:text-xl font-medium opacity-80 min-h-[2.5rem] transition-all px-2 break-words">
                 {sourceSubtitle || (isListening ? (t('listening') || "Listening...") : "")}
               </p>
            </div>
            
            <div className="w-12 h-[1px] bg-border-main shrink-0 mx-auto" />
            
            <div className="w-full text-center space-y-1">
               <p className="text-[10px] text-accent-text uppercase tracking-widest font-semibold">{t('talk_translated_audio') || 'Translation'}</p>
               <p className="text-xl md:text-2xl font-semibold text-accent-text min-h-[2.5rem] transition-all px-2 break-words">
                 {targetSubtitle || (isInitializing ? (t('connecting') || "Connecting...") : "")}
               </p>
            </div>
          </div>
        ) : (
          <div className="text-center opacity-40 m-auto flex flex-col items-center justify-center">
            <div className="relative mb-4 flex items-center justify-center">
              <div className="absolute inset-0 bg-accent/10 rounded-full scale-150 animate-ping duration-1000" />
              <Mic size={48} className="text-accent-text relative z-10" />
            </div>
            <p className="max-w-[280px] text-sm leading-relaxed">{t('talk_tap_mic_hint') || 'Tap the microphone to start real-time translation'}</p>
          </div>
        )}

      </div>

      {/* Mic Controls */}
      <div className="shrink-0 p-4 bg-gradient-to-t from-panel via-panel/90 to-transparent border-t border-border-main/50 pb-8 grid grid-cols-3 items-center px-6">
        
        {/* Left: Save History */}
        <div className="flex justify-start gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleSaveHistory(); }}
            className="w-12 h-12 rounded-full bg-panel text-text-muted border border-border-main hover:bg-bg-input flex items-center justify-center transition-colors"
            title="Save History"
          >
            <Save size={20} />
          </button>
          <button
            onClick={handleNativeShare}
            className="w-12 h-12 rounded-full bg-panel text-text-muted border border-border-main hover:bg-bg-input flex items-center justify-center transition-colors"
            title="Share"
          >
            <Share2 size={20} />
          </button>
        </div>

        {/* Center: Mic */}
        <div className="flex flex-col items-center gap-2 justify-center">
          <span className="text-[10px] text-text-muted opacity-60 font-medium whitespace-nowrap">
            {t('time_left') || 'Thời gian hôm nay'}: {Math.max(0, Math.floor((QUOTA_LIMIT - usedSeconds) / 60))} phút
          </span>

          <button 
            onClick={(e) => !isLimitReached && handleMicClick(e)}
            disabled={isLimitReached}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
              isListening 
                ? 'bg-accent text-accent-on border-2 border-accent animate-pulse shadow-accent/30 scale-110' 
                : isLimitReached
                  ? 'bg-panel text-text-muted border-2 border-border-main opacity-50 cursor-not-allowed'
                  : 'bg-panel text-accent border-2 border-accent/40 shadow-accent/10 hover:bg-bg-input'
            }`}
          >
            {isListening ? <Square size={24} /> : <Mic size={24} />}
          </button>
        </div>
        
        {/* Right: Empty spacer to center mic controls */}
        <div className="flex justify-end" />
      </div>
    </div>
  );
};
