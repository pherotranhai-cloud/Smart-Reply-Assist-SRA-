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

  return (
    <div className="flex flex-col h-full bg-surface shadow-sm border border-border-main rounded-3xl overflow-hidden relative talk-tab-container"
         onClick={() => setMenuOpen(false)}>
      
      <div className="flex items-center justify-between p-4 border-b border-border-main bg-panel z-10">
        <div className="flex items-center gap-2">
           <span className="text-sm font-semibold text-text-main opacity-70">
             Listen-along
           </span>
        </div>
      </div>

      <div className="flex-1 p-6 flex flex-col pt-6 pb-32">
        
        {isListening || sourceSubtitle || targetSubtitle || conversationLog.length > 0 ? (
          <div ref={scrollRef} className="flex-1 w-full max-h-[45vh] overflow-y-auto scroll-smooth pr-2 custom-scrollbar flex flex-col gap-6 items-center justify-center">
            <div className="w-full text-center space-y-2">
               <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">{t('talk_source_audio') || 'Source'}</p>
               <p className="text-xl font-medium opacity-80 min-h-[3rem] transition-all">
                 {sourceSubtitle || (isListening ? (t('listening') || "Listening...") : "")}
               </p>
            </div>
            
            <div className="w-12 h-[1px] bg-border-main shrink-0 mx-auto" />
            
            <div className="w-full text-center space-y-2">
               <p className="text-xs text-[#006D77] uppercase tracking-widest font-semibold">{t('talk_translated_audio') || 'Translation'}</p>
               <p className="text-2xl font-semibold text-[#006D77] min-h-[3rem] transition-all">
                 {targetSubtitle || (isInitializing ? (t('connecting') || "Connecting...") : "")}
               </p>
            </div>
          </div>
        ) : (
          <div className="text-center opacity-40 m-auto">
            <Globe size={48} className="mx-auto mb-4" />
            <p>{t('talk_tap_mic_hint') || 'Tap the microphone to start real-time translation'}</p>
          </div>
        )}

      </div>

      {menuOpen && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={() => setMenuOpen(false)} />
      )}

      {/* Mic Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-panel via-panel/90 to-transparent flex justify-center gap-8 items-center pb-8 border-t border-border-main/50 z-50">
        
        {/* Save History */}
        <button
          onClick={(e) => { e.stopPropagation(); handleSaveHistory(); }}
          className="w-12 h-12 rounded-full bg-panel text-text-muted border border-border-main hover:bg-bg-input flex items-center justify-center transition-colors"
          title="Save History"
        >
          <Save size={20} />
        </button>

        {/* Center Mic */}
        <div className="flex flex-col items-center gap-2 relative">
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="absolute bottom-full mb-4 bg-panel/90 backdrop-blur-xl border border-border-main rounded-2xl shadow-2xl p-2 w-48 max-h-[200px] overflow-y-auto custom-scrollbar flex flex-col gap-1 z-[100] origin-bottom"
              >
                <div className="text-[11px] font-medium tracking-widest text-slate-400 uppercase px-3 py-2">{t('targetLanguage') || 'Target Language'}</div>
                {ALL_LANGUAGES.map(lang => {
                  const isActive = myLang === lang;
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
            animate={menuOpen ? { scale: 0.95 } : { scale: 1 }}
            onPointerDown={(e) => handlePointerDown(e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onClick={(e) => handleClick(e)}
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
              isListening 
                ? 'bg-[#006D77] text-white border-2 border-[#006D77] animate-pulse shadow-[#006D77]/30 scale-110' 
                : 'bg-panel text-accent border-2 border-accent/40 shadow-accent/10 hover:bg-bg-input'
            }`}
          >
            {isListening ? <Square size={24} /> : <Mic size={24} />}
          </motion.button>
          
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} 
            className="text-[11px] font-semibold text-[#006D77] uppercase flex items-center gap-1 opacity-80 hover:opacity-100 px-2 py-1 rounded-full hover:bg-black/5 transition-colors"
          >
            {LANGUAGE_FLAGS[myLang]} {myLang.split(' ')[0]}
            <ChevronDown size={14} className="opacity-70" />
          </button>
        </div>

      </div>
    </div>
  );
};
