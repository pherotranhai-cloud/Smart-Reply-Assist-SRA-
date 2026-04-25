import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Square, Volume2, RotateCcw, Globe } from 'lucide-react';
import { LANGUAGE_FLAGS } from '../constants';
import { AIService } from '../services/ai';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { useTextToSpeech } from '../hooks/useTextToSpeech';

export interface TalkMessage {
  id: string;
  sender: 'user' | 'partner';
  originalText: string;
  originalLang: string;
  translatedText: string;
  translatedLang: string;
  timestamp: number;
}

interface TalkTabProps {
  settings: any;
  vocab: any[];
  t: (key: string) => string;
}

const ALL_LANGUAGES = ['Vietnamese', 'Chinese (Simplified)', 'Chinese (Traditional)', 'English', 'Indonesian', 'Burmese'] as const;

export const TalkTab: React.FC<TalkTabProps> = ({ settings, vocab, t }) => {
  const [messages, setMessages] = useState<TalkMessage[]>([]);
  
  // Persisted languages
  const [userLang, setUserLang] = useState<string>(() => localStorage.getItem('talk_user_lang') || 'Vietnamese');
  const [partnerLang, setPartnerLang] = useState<string>(() => localStorage.getItem('talk_partner_lang') || 'Chinese (Simplified)');
  
  useEffect(() => { localStorage.setItem('talk_user_lang', userLang); }, [userLang]);
  useEffect(() => { localStorage.setItem('talk_partner_lang', partnerLang); }, [partnerLang]);

  const { isListening, transcript, interimTranscript, error, startListening, stopListening, setTranscript } = useSpeechToText();
  const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech();
  
  const [activeSpeaker, setActiveSpeaker] = useState<'user' | 'partner' | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(null);

  // Context Menu State
  const [menuOpenFor, setMenuOpenFor] = useState<'user' | 'partner' | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressOccurred = useRef(false);
  const [dragHoverLang, setDragHoverLang] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Pre-warm action (optional, backend is adjusted, we just need to render fast)
  useEffect(() => {
    // Just an initialization
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript]);

  useEffect(() => {
    if (transcript && activeSpeaker && !isTranslating) {
      handleTranslation(transcript, activeSpeaker);
      setTranscript('');
      setActiveSpeaker(null);
      stopListening();
    }
  }, [transcript]);

  const handleTranslation = async (text: string, speaker: 'user' | 'partner') => {
    setIsTranslating(true);
    const ai = new AIService(settings);
    try {
      const sourceLang = speaker === 'user' ? userLang : partnerLang;
      const targetLang = speaker === 'user' ? partnerLang : userLang;
      
      const messageId = Date.now().toString();

      const newMessage: TalkMessage = {
         id: messageId,
         sender: speaker,
         originalText: text,
         originalLang: sourceLang,
         translatedText: '...',
         translatedLang: targetLang,
         timestamp: Date.now()
      };

      setMessages(prev => [...prev, newMessage]);
      
      await ai.talkStream(
        text, 
        targetLang,
        () => {
          // Stream rendering without TTS
        },
        (fullText) => {
          setMessages(prev => prev.map(m => m.id === messageId ? { ...m, translatedText: fullText } : m));
          setCurrentlySpeakingId(messageId);
          speak(fullText, targetLang, false, () => {}, () => setCurrentlySpeakingId(null));
        }
      );

    } catch (err) {
       console.error("Talk translation failed", err);
       setMessages(prev => prev.filter(m => m.originalText !== text)); 
    } finally {
      setIsTranslating(false);
    }
  };

  const getBrowserLangCode = (lang: string) => {
    if (lang === 'Vietnamese') return 'vi-VN';
    if (lang.includes('Chinese')) return 'zh-CN';
    if (lang === 'English') return 'en-US';
    if (lang === 'Indonesian') return 'id-ID';
    if (lang === 'Burmese') return 'my-MM';
    return 'en-US'; 
  };

  const toggleMic = (speaker: 'user' | 'partner') => {
    if (activeSpeaker === speaker) {
      stopListening();
      setActiveSpeaker(null);
    } else {
      stopSpeaking();
      setCurrentlySpeakingId(null);
      stopListening();
      setActiveSpeaker(speaker);
      const lang = speaker === 'user' ? getBrowserLangCode(userLang) : getBrowserLangCode(partnerLang);
      startListening(lang);
    }
  };

  const handlePointerDown = (speaker: 'user' | 'partner', e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    longPressOccurred.current = false;
    
    longPressTimer.current = setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(20);
      }
      longPressOccurred.current = true;
      stopListening();
      setActiveSpeaker(null);
      setMenuOpenFor(speaker);
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (menuOpenFor) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const langEl = el?.closest('[data-lang]');
      if (langEl) {
        const lang = langEl.getAttribute('data-lang');
        setDragHoverLang(lang);
      } else {
        setDragHoverLang(null);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (menuOpenFor && dragHoverLang) {
      selectLanguage(dragHoverLang);
    }
    setDragHoverLang(null);
  };

  const handleClick = (speaker: 'user' | 'partner', e: React.MouseEvent) => {
    e.stopPropagation();
    if (longPressOccurred.current) {
      // It was a long press, so this click is just the release. Ignore it.
      longPressOccurred.current = false;
      return;
    }

    if (menuOpenFor === speaker) {
      setMenuOpenFor(null);
    } else if (!menuOpenFor) {
      toggleMic(speaker);
    }
  };

  const selectLanguage = (lang: string) => {
    if (menuOpenFor === 'user') setUserLang(lang);
    if (menuOpenFor === 'partner') setPartnerLang(lang);
    setMenuOpenFor(null);
  };

  const clearHistory = () => {
    if (window.confirm('Clear conversation?')) {
      setMessages([]);
      stopListening();
      stopSpeaking();
      setCurrentlySpeakingId(null);
      setActiveSpeaker(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface shadow-sm border border-border-main rounded-3xl overflow-hidden relative"
         onClick={() => menuOpenFor && setMenuOpenFor(null)}>
      
      <div className="flex items-center justify-between p-4 border-b border-border-main bg-panel z-10">
        <div className="flex items-center gap-2">
           <span className="text-sm font-semibold text-text-main opacity-70">
             {LANGUAGE_FLAGS[partnerLang]} &harr; {LANGUAGE_FLAGS[userLang]}
           </span>
        </div>
        <button onClick={clearHistory} className="text-gray-400 hover:text-red-500 transition-colors p-2" title="Clear Chat">
          <RotateCcw size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col pt-6 pb-40">
        <AnimatePresence>
          {messages.map(msg => {
            const isPartner = msg.sender === 'partner';
            return (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col max-w-[85%] ${isPartner ? 'self-start' : 'self-end'}`}
              >
                <div 
                  className={`p-4 rounded-2xl shadow-sm transition-all duration-300 ${
                    currentlySpeakingId === msg.id ? 'opacity-90 ring-2 ring-[#006D77]/50 ring-offset-2 ring-offset-surface' : ''
                  } ${
                    isPartner 
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm' 
                      : 'bg-[#006D77] text-white rounded-tr-sm'
                  }`}
                >
                  <p className="text-sm opacity-70 mb-1 leading-tight">{msg.originalText}</p>
                  
                  {msg.translatedText === '...' ? (
                    <div className="flex h-6 items-center gap-1.5 mt-2">
                      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }} className={`w-2 h-2 rounded-full ${isPartner ? 'bg-[#006D77]' : 'bg-white'}`} />
                      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className={`w-2 h-2 rounded-full ${isPartner ? 'bg-[#006D77]' : 'bg-white'}`} />
                      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }} className={`w-2 h-2 rounded-full ${isPartner ? 'bg-[#006D77]' : 'bg-white'}`} />
                    </div>
                  ) : (
                    <div className="flex items-end justify-between gap-3">
                      <p className={`text-lg font-medium leading-snug ${['Chinese', 'Burmese'].some(lang => msg.translatedLang.includes(lang)) ? 'text-[1.2em]' : ''}`}>{msg.translatedText}</p>
                      {currentlySpeakingId === msg.id && (
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ repeat: Infinity, duration: 1.5 }}
                          className={`${isPartner ? 'text-[#006D77]' : 'text-white'}`}
                        >
                          <Volume2 size={16} />
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
                <div className={`mt-1 flex items-center gap-1 opacity-50 ${isPartner ? 'justify-start' : 'justify-end'}`}>
                   <button 
                     onClick={() => {
                        setCurrentlySpeakingId(msg.id);
                        speak(msg.translatedText, msg.translatedLang, false, () => {}, () => setCurrentlySpeakingId(null));
                     }}
                     className="p-1 hover:text-[#006D77] transition-colors flex items-center gap-1 bg-surface border border-border-main rounded-md shadow-sm"
                     title="Re-play translation"
                   >
                     <Volume2 size={12} />
                     <span className="text-[10px] font-medium">Re-play</span>
                   </button>
                   <span className="text-[10px] ml-1">{LANGUAGE_FLAGS[msg.originalLang]} &rarr; {LANGUAGE_FLAGS[msg.translatedLang]}</span>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        {activeSpeaker && interimTranscript && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`flex flex-col max-w-[85%] ${activeSpeaker === 'partner' ? 'self-start' : 'self-end'}`}
          >
             <div className={`p-4 rounded-2xl shadow-sm opacity-60 ${activeSpeaker === 'partner' ? 'bg-slate-100 dark:bg-slate-800 rounded-tl-sm' : 'bg-[#006D77] text-white rounded-tr-sm'}`}>
                <p className="animate-pulse">{interimTranscript}...</p>
             </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {menuOpenFor && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={() => setMenuOpenFor(null)} />
      )}

      {/* Mic Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-panel via-panel/90 to-transparent flex justify-center gap-8 items-center pb-8 border-t border-border-main/50 z-50">
        
        {/* Partner Mic */}
        <div className="flex flex-col items-center gap-2 relative">
          <AnimatePresence>
            {menuOpenFor === 'partner' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="absolute bottom-full mb-4 bg-panel/90 backdrop-blur-xl border border-border-main rounded-2xl shadow-2xl p-2 w-48 flex flex-col gap-1 z-50 origin-bottom"
              >
                <div className="text-xs font-semibold text-text-muted px-3 py-2 uppercase tracking-wider">Select Partner Lang</div>
                {ALL_LANGUAGES.map(lang => {
                  const isActive = partnerLang === lang;
                  const isHovered = dragHoverLang === lang;
                  return (
                    <button
                      key={lang}
                      data-lang={lang}
                      onClick={(e) => { e.stopPropagation(); selectLanguage(lang); }}
                      className={`flex items-center gap-3 w-full text-left px-3 py-3 rounded-xl transition-colors ${
                        isHovered ? 'bg-[#006D77] text-white' : isActive ? 'bg-[#006D77]/10 text-[#006D77] font-medium' : 'text-text-main hover:bg-muted/5'
                      }`}
                    >
                      <span className="text-lg">{LANGUAGE_FLAGS[lang]}</span>
                      <span className="text-sm truncate flex-1">{lang}</span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button 
            animate={menuOpenFor === 'partner' ? { scale: 0.95 } : { scale: 1 }}
            onPointerDown={(e) => handlePointerDown('partner', e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={(e) => handleClick('partner', e)}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
              activeSpeaker === 'partner' 
                ? 'bg-[#006D77] text-white border-2 border-[#006D77] animate-pulse shadow-[#006D77]/30 scale-110' 
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-2 border-slate-200 dark:border-slate-600 shadow-slate-300/50 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            {activeSpeaker === 'partner' ? <Square size={24} /> : <div className="text-center"><Mic size={24} /></div>}
          </motion.button>
          <span className="text-[11px] font-semibold text-slate-500 uppercase flex items-center gap-1 opacity-80">
            {LANGUAGE_FLAGS[partnerLang]} {partnerLang.split(' ')[0]}
          </span>
        </div>

        {/* User Mic */}
        <div className="flex flex-col items-center gap-2 relative">
          <AnimatePresence>
            {menuOpenFor === 'user' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="absolute bottom-full mb-4 bg-panel/90 backdrop-blur-xl border border-border-main rounded-2xl shadow-2xl p-2 w-48 flex flex-col gap-1 z-50 origin-bottom"
              >
                <div className="text-xs font-semibold text-text-muted px-3 py-2 uppercase tracking-wider">Select Your Lang</div>
                {ALL_LANGUAGES.map(lang => {
                  const isActive = userLang === lang;
                  const isHovered = dragHoverLang === lang;
                  return (
                    <button
                      key={lang}
                      data-lang={lang}
                      onClick={(e) => { e.stopPropagation(); selectLanguage(lang); }}
                      className={`flex items-center gap-3 w-full text-left px-3 py-3 rounded-xl transition-colors ${
                        isHovered ? 'bg-[#006D77] text-white' : isActive ? 'bg-[#006D77]/10 text-[#006D77] font-medium' : 'text-text-main hover:bg-muted/5'
                      }`}
                    >
                      <span className="text-lg">{LANGUAGE_FLAGS[lang]}</span>
                      <span className="text-sm truncate flex-1">{lang}</span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button 
            animate={menuOpenFor === 'user' ? { scale: 0.95 } : { scale: 1 }}
            onPointerDown={(e) => handlePointerDown('user', e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={(e) => handleClick('user', e)}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
              activeSpeaker === 'user' 
                ? 'bg-[#006D77] text-white border-2 border-[#006D77] animate-pulse shadow-[#006D77]/30 scale-110' 
                : 'bg-white dark:bg-slate-800 text-[#006D77] border-2 border-[#006D77]/40 shadow-[#006D77]/10 hover:bg-[#006D77]/5'
            }`}
          >
            {activeSpeaker === 'user' ? <Square size={24} /> : <Mic size={24} />}
          </motion.button>
          <span className="text-[11px] font-semibold text-[#006D77] uppercase flex items-center gap-1 opacity-80">
            {LANGUAGE_FLAGS[userLang]} {userLang.split(' ')[0]}
          </span>
        </div>

      </div>
    </div>
  );
};
