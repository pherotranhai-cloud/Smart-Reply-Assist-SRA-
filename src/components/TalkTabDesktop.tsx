import React from 'react';
import { Mic, Square, Save, Share2, AlertCircle } from 'lucide-react';
import { LANGUAGE_FLAGS } from '../constants';
import { useTalkTab } from '../hooks/useTalkTab';
import { VoiceVisualizer } from './common/VoiceVisualizer';

const ALL_LANGUAGES = ['Vietnamese', 'Chinese (Simplified)', 'Chinese (Traditional)', 'English', 'Indonesian', 'Burmese'] as const;

interface TalkTabDesktopProps {
  settings: any;
  vocab: any[];
  t: (key: string) => string;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const TalkTabDesktop: React.FC<TalkTabDesktopProps> = ({ settings, vocab, t, showToast }) => {
  const {
    myLang, setMyLang, usedSeconds, QUOTA_LIMIT, isListening,
    sourceSubtitle, targetSubtitle, isInitializing, connectionProgress,
    currentTriviaKey, scrollRef, isLimitReached, handleMicClick,
    handleSaveHistory, handleNativeShare, conversationLog
  } = useTalkTab({ t, showToast });

  const progressPercentage = Math.min(100, (usedSeconds / QUOTA_LIMIT) * 100);

  return (
    <div className="grid grid-cols-12 gap-6 w-full h-[calc(100vh-140px)] min-h-0 overflow-hidden pb-4 p-6 bg-app">
      {/* Left Column (7/12): Dual Subtitle Panel */}
      <div className="col-span-7 flex flex-col h-full min-h-0 bg-panel border border-border-main rounded-3xl p-6 justify-between">
        <div className="flex items-center justify-between pb-4 border-b border-border-main flex-shrink-0">
          <h2 className="text-xl font-semibold text-text-main">
            {t('live_translate')}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-muted">{t('talk_my_lang')}</span>
            <div className="relative inline-block overflow-hidden cursor-pointer">
              {/* Nút hiển thị giao diện giả lập sang trọng hiện tại */}
              <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-panel border border-border-main text-sm font-medium text-text-main hover:bg-border-main/20 transition-colors">
                <span>{LANGUAGE_FLAGS[myLang as keyof typeof LANGUAGE_FLAGS]}</span>
                <span>{myLang}</span>
              </button>
              
              {/* Thẻ select ẩn thực tế đè lên trên để nhận click */}
              <select
                value={myLang}
                onChange={(e) => setMyLang(e.target.value)}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-20"
              >
                {ALL_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {LANGUAGE_FLAGS[lang as keyof typeof LANGUAGE_FLAGS]} {lang}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className={`flex-1 w-full overflow-y-auto my-4 pr-2 custom-scrollbar flex flex-col gap-6 ${conversationLog.length === 0 && !sourceSubtitle && !targetSubtitle ? 'justify-center items-center' : ''}`} ref={scrollRef}>
          {conversationLog.map((log, idx) => (
            <div key={idx} className="flex flex-col gap-3 w-full">
              <div className="bg-app rounded-2xl rounded-tl-none p-5 max-w-[85%] self-start shadow-sm border border-border-main">
                <p className="text-xl text-text-main leading-relaxed">{log.source}</p>
                <span className="text-xs text-text-muted mt-2 block opacity-70">
                  {log.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="bg-accent/10 rounded-2xl rounded-tr-none p-5 max-w-[85%] self-end shadow-sm">
                <p className="text-2xl font-medium text-accent leading-relaxed">{log.translated}</p>
                <span className="text-xs text-accent/70 mt-2 block text-right">
                  {log.timestamp.toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}

          {(sourceSubtitle || targetSubtitle) && (
            <div className="flex flex-col gap-3 w-full">
              {sourceSubtitle && (
                <div className="bg-app rounded-2xl rounded-tl-none p-5 max-w-[85%] self-start shadow-sm border border-border-main">
                  <p className="text-xl text-text-main leading-relaxed">{sourceSubtitle}</p>
                  <VoiceVisualizer isListening={true} onClick={() => handleMicClick({ stopPropagation: () => {} } as any)} />
                </div>
              )}
              {targetSubtitle && (
                <div className="bg-accent/10 rounded-2xl rounded-tr-none p-5 max-w-[85%] self-end shadow-sm">
                  <p className="text-2xl font-medium text-accent leading-relaxed">{targetSubtitle}</p>
                </div>
              )}
            </div>
          )}

          {!isListening && conversationLog.length === 0 && !sourceSubtitle && !targetSubtitle && (
            <div className="flex flex-col items-center justify-center text-center px-8 opacity-50">
              <Mic size={64} className="mb-4 text-text-muted" />
              <p className="text-2xl font-medium text-text-muted">{t('talk_empty_state')}</p>
              <p className="text-lg text-text-muted mt-2">{t('talk_empty_sub_hint')}</p>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-border-main flex items-center justify-end gap-3 flex-shrink-0">
          <button 
            onClick={handleNativeShare}
            disabled={conversationLog.length === 0 && !sourceSubtitle && !targetSubtitle}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-text-muted hover:text-text-main hover:bg-app border border-border-main transition-colors disabled:opacity-50"
          >
            <Share2 size={18} />
            <span className="font-medium text-sm">{t('share')}</span>
          </button>
          <button 
            onClick={handleSaveHistory}
            disabled={conversationLog.length === 0 && !sourceSubtitle && !targetSubtitle}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-accent bg-accent/10 hover:bg-accent/20 transition-colors disabled:opacity-50"
          >
            <Save size={18} />
            <span className="font-medium text-sm">{t('saveHistory')}</span>
          </button>
        </div>
      </div>

      {/* Right Column (5/12): Control Panel */}
      <div className="col-span-5 h-full min-h-0 bg-panel border border-border-main rounded-3xl p-6 flex flex-col items-center justify-center relative shadow-sm">
        
        {/* Trivia Area */}
        <div className="w-full bg-app rounded-2xl p-6 border border-border-main min-h-[120px] flex items-center justify-center text-center shadow-inner flex-shrink-0">
          {isInitializing ? (
            <div className="flex flex-col items-center gap-3">
              <div className="text-accent font-medium animate-pulse">{t('connecting')}... {connectionProgress}%</div>
              <div className="w-48 h-1.5 bg-border-main rounded-full overflow-hidden">
                <div className="h-full bg-accent transition-all duration-300" style={{ width: `${connectionProgress}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-text-muted text-lg font-medium leading-relaxed italic">
              "{t(currentTriviaKey)}"
            </p>
          )}
        </div>

        {/* Big Mic Button */}
        <div className="relative my-auto flex items-center justify-center">
          {isListening && (
            <>
              <div className="absolute inset-0 bg-[#006D77] rounded-full animate-ping opacity-20" style={{ transform: 'scale(1.8)' }}></div>
              <div className="absolute inset-0 bg-[#006D77] rounded-full animate-pulse opacity-30" style={{ transform: 'scale(1.4)' }}></div>
            </>
          )}
          
          <button
            onClick={handleMicClick}
            disabled={isLimitReached}
            className={`relative z-10 w-32 h-32 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-105 ${
              isLimitReached 
                ? 'bg-app border-4 border-border-main text-text-muted opacity-50 cursor-not-allowed'
                : isListening
                  ? 'bg-[#006D77] text-white border-4 border-[#005B63] shadow-lg shadow-[#006D77]/50'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-white border-4 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 shadow-sm'
            }`}
          >
            {isListening ? <Square size={48} className="animate-pulse" /> : <Mic size={48} />}
          </button>
        </div>

        {/* Quota Progress */}
        <div className="w-full flex flex-col gap-3 mt-auto flex-shrink-0">
          <div className="flex items-center justify-between text-sm font-medium">
            <span className="text-text-main flex items-center gap-2">
              <AlertCircle size={16} className={isLimitReached ? "text-red-500" : "text-accent"} />
              {t('time_left')}
            </span>
            <span className={isLimitReached ? "text-red-500 font-bold" : "text-text-muted"}>
              {Math.floor(usedSeconds / 60)}:{String(usedSeconds % 60).padStart(2, '0')} / {Math.floor(QUOTA_LIMIT / 60)}:00
            </span>
          </div>
          <div className="w-full h-3 bg-border-main rounded-full overflow-hidden shadow-inner">
            <div 
              className={`h-full transition-all duration-1000 ${
                progressPercentage > 90 ? 'bg-red-500' : progressPercentage > 75 ? 'bg-orange-500' : 'bg-accent'
              }`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
