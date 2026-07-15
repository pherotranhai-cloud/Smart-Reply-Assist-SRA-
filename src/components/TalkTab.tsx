import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Square, Save, Globe, ChevronDown } from 'lucide-react';
import { LANGUAGE_FLAGS } from '../constants';
import { safeLocalStorage } from '../utils/safeStorage';
import { storage } from '../services/storage';

const ALL_LANGUAGES = ['Vietnamese', 'Chinese (Simplified)', 'Chinese (Traditional)', 'English', 'Indonesian', 'Burmese'] as const;

interface TalkTabProps {
  settings: any;
  vocab: any[];
  t: (key: string) => string;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const TalkTab: React.FC<TalkTabProps> = ({ settings, vocab, t, showToast }) => {
  const [myLang, setMyLang] = useState<string>(() => safeLocalStorage.getItem('talk_my_lang') || 'Vietnamese');
  
  useEffect(() => { safeLocalStorage.setItem('talk_my_lang', myLang); }, [myLang]);

  const QUOTA_LIMIT = 900;
  const todayDate = new Date().toISOString().split('T')[0];
  
  const [usedSeconds, setUsedSeconds] = useState<number>(() => {
    const savedDate = safeLocalStorage.getItem('talktab_usage_date');
    const savedSeconds = safeLocalStorage.getItem('talktab_usage_seconds');
    if (savedDate === todayDate && savedSeconds) {
      return parseInt(savedSeconds, 10);
    }
    safeLocalStorage.setItem('talktab_usage_date', todayDate);
    safeLocalStorage.setItem('talktab_usage_seconds', '0');
    return 0;
  });

  const [isListening, setIsListening] = useState(false);
  const [sourceSubtitle, setSourceSubtitle] = useState<string>('');
  const [targetSubtitle, setTargetSubtitle] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);
  
  const [conversationLog, setConversationLog] = useState<{source: string, translated: string, timestamp: Date}[]>([]);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sourceSubtitle, targetSubtitle]);
  
  // Context Menu State
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressOccurred = useRef(false);
  const [dragHoverLang, setDragHoverLang] = useState<string | null>(null);

  const closeRealtimeStream = () => {
    setConversationLog(prev => {
      if (sourceSubtitle || targetSubtitle) {
        return [...prev, { source: sourceSubtitle, translated: targetSubtitle, timestamp: new Date() }];
      }
      return prev;
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setIsListening(false);
    setIsInitializing(false);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isListening) {
      interval = setInterval(() => {
        setUsedSeconds(prev => {
          const newVal = prev + 1;
          safeLocalStorage.setItem('talktab_usage_seconds', newVal.toString());
          
          if (newVal >= QUOTA_LIMIT) {
            closeRealtimeStream();
            showToast(t('quota_exceeded') || "Quota exceeded for today", 'error');
          }
          return newVal;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isListening, t, showToast]); // include closeRealtimeStream logic via closure but it's safe

  useEffect(() => {
    return () => {
      closeRealtimeStream();
    };
  }, []);

  const initRealtimeStream = async () => {
    if (isListening) {
      closeRealtimeStream();
      return;
    }

    try {
      setIsInitializing(true);
      setIsListening(true);
      setSourceSubtitle('');
      setTargetSubtitle('');

      // Gửi string ngôn ngữ nguyên bản lên Backend để mapper xử lý
      const currentTargetLang = myLang;
      
      const SERVER_BASE_URL = import.meta.env.VITE_RENDER_SERVER_URL || import.meta.env.VITE_API_URL || '';
      
      const sessionRes = await fetch(`${SERVER_BASE_URL}/api/realtime/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLang: currentTargetLang })
      });
      
      const sessionData = await sessionRes.json();
      
      if (sessionData.error || !sessionData.token) {
        throw new Error(sessionData.error || 'Không thể lấy được token phẳng từ Render Server');
      }

      // Nhận trực tiếp mã an toàn sạch để đưa vào luồng bắt tay SDP phía dưới
      const ephemeralKey = sessionData.token;

      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // Create an audio element for remote audio
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      pc.ontrack = e => {
        audioEl.srcObject = e.streams[0];
      };

      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });

      const dataChannel = pc.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;
      
      dataChannel.addEventListener("message", (e) => {
        try {
          const event = JSON.parse(e.data);
          
          // Phụ đề dịch (âm thanh từ AI)
          if (event.type === "session.output_transcript.delta") {
            setTargetSubtitle(prev => prev + event.delta);
          }
          
          // Phụ đề gốc (âm thanh từ người nói)
          if (event.type === "session.input_transcript.delta") {
            setSourceSubtitle(prev => prev + event.delta);
          }
        } catch (err) {
          console.error("Lỗi phân tích Data Channel:", err);
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Thực hiện gửi trực tiếp gói tin SDP Offer lên cổng kết nối WebRTC của OpenAI
      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/translations/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`, // Token phẳng an toàn nhận từ Render
          "Content-Type": "application/sdp"
        },
      });

      if (!sdpResponse.ok) {
         throw new Error(`OpenAI API error: ${sdpResponse.statusText}`);
      }
      
      const answer = {
        type: "answer" as RTCSdpType,
        sdp: await sdpResponse.text(),
      };
      
      await pc.setRemoteDescription(answer);

    } catch (error: any) {
      console.error("Realtime Stream Error:", error);
      if (error.name === 'NotAllowedError' || error.name === 'NotFoundError') {
        showToast(t('error_mic_permission') || "Thiếu quyền Micro: Vui lòng cấp quyền truy cập Micro để sử dụng.", 'error');
      } else if (error.message && error.message.includes("Render Server")) {
        showToast(t('error_render_server') || "Lỗi máy chủ kết nối Render: Không thể lấy khóa xác thực. Vui lòng thử lại sau.", 'error');
      } else if (error.message && error.message.includes("OpenAI")) {
        showToast(t('error_openai_connection') || "Lỗi kết nối OpenAI: Không thể thiết lập luồng giọng nói. Vui lòng thử lại.", 'error');
      } else {
        showToast(t('error_network_unstable') || "Kết nối không ổn định, vui lòng kiểm tra lại mạng Wifi/4G hoặc thử lại.", 'error');
      }
      closeRealtimeStream();
    } finally {
      setIsInitializing(false);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    longPressOccurred.current = false;
    
    longPressTimer.current = setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(20);
      }
      longPressOccurred.current = true;
      closeRealtimeStream();
      setMenuOpen(true);
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (menuOpen) {
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
    
    if (menuOpen && dragHoverLang) {
      selectLanguage(dragHoverLang);
    }
    setDragHoverLang(null);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (longPressOccurred.current) {
      longPressOccurred.current = false;
      return;
    }
if (menuOpen) {
      setMenuOpen(false);
    } else {
      if (isListening) {
        closeRealtimeStream();
      } else {
        initRealtimeStream();
      }
    }
  };

  const selectLanguage = (lang: string) => {
    setMyLang(lang);
    setMenuOpen(false);
  };

  const handleSaveHistory = async () => {
    if (conversationLog.length === 0 && !sourceSubtitle && !targetSubtitle) return;
    
    const finalLog = [...conversationLog];
    if (sourceSubtitle || targetSubtitle) {
      finalLog.push({
        source: sourceSubtitle,
        translated: targetSubtitle,
        timestamp: new Date()
      });
    }

    try {
      const input = finalLog.map(l => l.source).join('\n\n');
      const output = finalLog.map(l => l.translated).join('\n\n');

      await storage.addHistory({
        type: 'talk',
        input,
        output,
        fromLang: 'Auto',
        toLang: myLang
      });

      showToast(t('talk_save_success') || "Đã lưu cuộc trò chuyện vào Lịch sử!", 'success');
      setConversationLog([]);
      setSourceSubtitle('');
      setTargetSubtitle('');
    } catch (error) {
      console.error("Lỗi khi lưu lịch sử:", error);
      showToast(t('error_save_history') || "Lỗi lưu trữ, vui lòng thử lại.", 'error');
    }
  };

  const isLimitReached = usedSeconds >= QUOTA_LIMIT;

  return (
    <div className="flex flex-col h-full bg-surface shadow-sm border border-border-main rounded-3xl relative overflow-visible pb-4 talk-tab-container"
         onClick={() => setMenuOpen(false)}>
      
      <div className="flex items-center justify-between p-4 border-b border-border-main bg-panel rounded-t-3xl z-10">
        <div className="flex items-center gap-2">
           <Mic size={18} className="text-[#006D77]" />
           <span className="text-sm font-semibold text-text-main opacity-80">
             {t('live_translator') || 'Live Translator'}
           </span>
        </div>
        
        {/* Dropdown Ngôn ngữ chuyển lên đây */}
        <div className="relative">
          {/* Nút bấm mở Dropdown tinh gọn */}
          <button 
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} 
            className="flex items-center gap-1 text-xs font-semibold text-[#006D77] bg-[#006D77]/10 px-3 py-1.5 rounded-full hover:bg-[#006D77]/20 transition-all"
          >
            <span>{LANGUAGE_FLAGS[myLang]} {myLang.split(' ')[0]}</span>
            <ChevronDown size={14} />
          </button>
          
          {/* List Dropdown hiển thị tuyệt đối (absolute) đè lên trên, căn lề phải (right-0) */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="absolute right-0 top-full mt-2 bg-panel/95 backdrop-blur-xl border border-border-main rounded-2xl shadow-2xl p-1.5 w-44 z-[999] max-h-[220px] overflow-y-auto custom-scrollbar flex flex-col gap-1 origin-top-right"
              >
                <div className="text-[10px] font-medium tracking-widest text-slate-400 uppercase px-3 py-1">{t('targetLanguage') || 'Target Language'}</div>
                {ALL_LANGUAGES.map(lang => {
                  const isActive = myLang === lang;
                  const isHovered = dragHoverLang === lang;
                  return (
                    <button
                      key={lang}
                      data-lang={lang}
                      onClick={(e) => { e.stopPropagation(); selectLanguage(lang); setMenuOpen(false); }}
                      className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-xs transition-colors ${
                        isHovered ? 'bg-[#006D77] text-white' : isActive ? 'bg-[#006D77]/10 text-[#006D77] font-medium' : 'text-text-main hover:bg-muted/5'
                      }`}
                    >
                      <span>{LANGUAGE_FLAGS[lang]}</span>
                      <span className="truncate flex-1">{lang}</span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-1 px-6 pt-4 pb-36 flex flex-col min-h-0 w-full relative">
        
        {isListening || sourceSubtitle || targetSubtitle || conversationLog.length > 0 ? (
          <div ref={scrollRef} className="flex-1 min-h-0 w-full overflow-y-auto scroll-smooth pr-2 custom-scrollbar flex flex-col justify-start gap-8 py-4">
            <div className="w-full text-center space-y-1 flex-1 flex flex-col justify-center">
               <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">{t('talk_source_audio') || 'Source'}</p>
               <p className="text-lg md:text-xl font-medium opacity-80 min-h-[2.5rem] transition-all px-2 break-words">
                 {sourceSubtitle || (isListening ? (t('listening') || "Listening...") : "")}
               </p>
            </div>
            
            <div className="w-12 h-[1px] bg-border-main shrink-0 mx-auto" />
            
            <div className="w-full text-center space-y-1 flex-1 flex flex-col justify-center">
               <p className="text-[10px] text-[#006D77] uppercase tracking-widest font-semibold">{t('talk_translated_audio') || 'Translation'}</p>
               <p className="text-xl md:text-2xl font-semibold text-[#006D77] min-h-[2.5rem] transition-all px-2 break-words">
                 {targetSubtitle || (isInitializing ? (t('connecting') || "Connecting...") : "")}
               </p>
            </div>
          </div>
        ) : (
          <div className="text-center opacity-40 m-auto flex flex-col items-center justify-center">
            <div className="relative mb-4 flex items-center justify-center">
              <div className="absolute inset-0 bg-[#006D77]/10 rounded-full scale-150 animate-ping duration-1000" />
              <Mic size={48} className="text-[#006D77] relative z-10" />
            </div>
            <p className="max-w-[280px] text-sm leading-relaxed">{t('talk_tap_mic_hint') || 'Tap the microphone to start real-time translation'}</p>
          </div>
        )}

      </div>

      {/* Mic Controls */}
      <div className="absolute bottom-0 left-0 right-0 py-4 px-6 bg-gradient-to-t from-panel via-panel/90 to-transparent border-t border-border-main/50 z-50 grid grid-cols-3 items-center">
        
        {/* Left: Save History */}
        <div className="flex justify-start">
          <button
            onClick={(e) => { e.stopPropagation(); handleSaveHistory(); }}
            className="w-12 h-12 rounded-full bg-panel text-text-muted border border-border-main hover:bg-bg-input flex items-center justify-center transition-colors"
            title="Save History"
          >
            <Save size={20} />
          </button>
        </div>

        {/* Center: Mic */}
        <div className="flex flex-col items-center gap-2 justify-center">
          <span className="text-[10px] text-text-muted opacity-60 font-medium whitespace-nowrap">
            {t('time_left') || 'Thời gian hôm nay'}: {Math.max(0, Math.floor((QUOTA_LIMIT - usedSeconds) / 60))} phút
          </span>

          <motion.button 
            animate={menuOpen ? { scale: 0.95 } : { scale: 1 }}
            onPointerDown={(e) => !isLimitReached && handlePointerDown(e)}
            onPointerMove={(e) => !isLimitReached && handlePointerMove(e)}
            onPointerUp={(e) => !isLimitReached && handlePointerUp(e)}
            onPointerCancel={(e) => !isLimitReached && handlePointerUp(e)}
            onClick={(e) => !isLimitReached && handleClick(e)}
            disabled={isLimitReached}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
              isListening 
                ? 'bg-[#006D77] text-white border-2 border-[#006D77] animate-pulse shadow-[#006D77]/30 scale-110' 
                : isLimitReached
                  ? 'bg-panel text-text-muted border-2 border-border-main opacity-50 cursor-not-allowed'
                  : 'bg-panel text-accent border-2 border-accent/40 shadow-accent/10 hover:bg-bg-input'
            }`}
          >
            {isListening ? <Square size={24} /> : <Mic size={24} />}
          </motion.button>
        </div>
        
        {/* Right: Empty spacer to center mic controls */}
        <div className="flex justify-end" />
      </div>
    </div>
  );
};
