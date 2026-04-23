import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Square, Volume2, RotateCcw } from 'lucide-react';
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

const SUPPORTED_PARTNER_LANGS = ['Chinese (Simplified)', 'Chinese (Traditional)', 'English', 'Indonesian', 'Burmese'] as const;

export const TalkTab: React.FC<TalkTabProps> = ({ settings, vocab, t }) => {
  const [messages, setMessages] = useState<TalkMessage[]>([]);
  const [partnerLang, setPartnerLang] = useState<string>('Chinese (Simplified)');
  
  const { isListening, transcript, interimTranscript, error, startListening, stopListening, setTranscript } = useSpeechToText();
  const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech();
  
  const [activeSpeaker, setActiveSpeaker] = useState<'user' | 'partner' | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      const sourceLang = speaker === 'user' ? 'Vietnamese' : partnerLang;
      const targetLang = speaker === 'user' ? partnerLang : 'Vietnamese';
      
      const messageId = Date.now().toString();

      // Placeholder for immediate UI response
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
        (sentence) => {
          // Module 3: Sentence triggering for concurrent speech to reduce perceived wait time
          speak(sentence, targetLang);
        },
        (fullText) => {
          // Module 4: Update the UI with the final translated string
          setMessages(prev => prev.map(m => m.id === messageId ? { ...m, translatedText: fullText } : m));
        }
      );

    } catch (err) {
       console.error("Talk translation failed", err);
       setMessages(prev => prev.filter(m => m.originalText !== text)); // drop failed placeholder
    } finally {
      setIsTranslating(false);
    }
  };

  const toggleMic = (speaker: 'user' | 'partner') => {
    if (activeSpeaker === speaker) {
      stopListening();
      setActiveSpeaker(null);
    } else {
      stopSpeaking();
      stopListening();
      setActiveSpeaker(speaker);
      const lang = speaker === 'user' ? 'vi-VN' : getBrowserLangCode(partnerLang);
      startListening(lang);
    }
  };

  const getBrowserLangCode = (lang: string) => {
    if (lang.includes('Chinese')) return 'zh-CN';
    if (lang === 'English') return 'en-US';
    if (lang === 'Indonesian') return 'id-ID';
    if (lang === 'Burmese') return 'my-MM';
    return 'en-US'; 
  };

  const clearHistory = () => {
    if (window.confirm('Clear conversation?')) {
      setMessages([]);
      stopListening();
      stopSpeaking();
      setActiveSpeaker(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface shadow-sm border border-border-main rounded-3xl overflow-hidden relative">
      
      <div className="flex items-center justify-between p-4 border-b border-border-main bg-panel z-10">
        <div className="flex items-center gap-2">
           <select 
             className="bg-transparent text-sm font-semibold outline-none cursor-pointer hover:text-[#004A99] transition-colors"
             value={partnerLang}
             onChange={(e) => setPartnerLang(e.target.value)}
           >
             {SUPPORTED_PARTNER_LANGS.map(l => (
               <option key={l} value={l} className="bg-panel text-text-main">{LANGUAGE_FLAGS[l]} {l}</option>
             ))}
           </select>
        </div>
        <button onClick={clearHistory} className="text-gray-400 hover:text-red-500 transition-colors p-2" title="Clear Chat">
          <RotateCcw size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 flex flex-col pt-6 pb-32">
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
                  className={`p-4 rounded-2xl shadow-sm ${
                    isPartner 
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm' 
                      : 'bg-[#004A99] text-white rounded-tr-sm'
                  }`}
                >
                  <p className="text-sm opacity-70 mb-1 leading-tight">{msg.originalText}</p>
                  <p className="text-lg font-medium leading-snug">{msg.translatedText}</p>
                </div>
                <div className={`mt-1 flex items-center gap-1 opacity-50 ${isPartner ? 'justify-start' : 'justify-end'}`}>
                   <button 
                     onClick={() => speak(msg.translatedText, msg.translatedLang)}
                     className="p-1 hover:text-[#004A99] transition-colors"
                   >
                     <Volume2 size={12} />
                   </button>
                   <span className="text-[10px]">{LANGUAGE_FLAGS[msg.originalLang]} &rarr; {LANGUAGE_FLAGS[msg.translatedLang]}</span>
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
             <div className={`p-4 rounded-2xl shadow-sm opacity-60 ${activeSpeaker === 'partner' ? 'bg-slate-100 dark:bg-slate-800 rounded-tl-sm' : 'bg-[#004A99] text-white rounded-tr-sm'}`}>
                <p className="animate-pulse">{interimTranscript}...</p>
             </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-panel via-panel/90 to-transparent flex justify-center gap-8 items-center pb-8 border-t border-border-main/50">
        
        <div className="flex flex-col items-center gap-2">
          <button 
            onClick={() => toggleMic('partner')}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
              activeSpeaker === 'partner' 
                ? 'bg-red-500 text-white animate-pulse shadow-red-500/30 scale-110' 
                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:scale-105'
            }`}
          >
            {activeSpeaker === 'partner' ? <Square size={24} /> : <Mic size={24} />}
          </button>
          <span className="text-[11px] font-semibold text-gray-500 uppercase flex items-center gap-1">
            {LANGUAGE_FLAGS[partnerLang]} {partnerLang.split(' ')[0]}
          </span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button 
            onClick={() => toggleMic('user')}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
              activeSpeaker === 'user' 
                ? 'bg-red-500 text-white animate-pulse shadow-red-500/30 scale-110' 
                : 'bg-[#004A99] text-white hover:scale-105 shadow-[#004A99]/20'
            }`}
          >
            {activeSpeaker === 'user' ? <Square size={24} /> : <Mic size={24} />}
          </button>
          <span className="text-[11px] font-semibold text-[#004A99] uppercase flex items-center gap-1">
            🇻🇳 Tiếng Việt
          </span>
        </div>

      </div>
    </div>
  );
};
