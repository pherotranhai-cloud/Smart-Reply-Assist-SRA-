import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Save, Globe, ChevronDown, Share2 } from 'lucide-react';
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
  const [connectionProgress, setConnectionProgress] = useState<number>(0);
  const TRIVIA_KEYS = ['talk_trivia_1', 'talk_trivia_2', 'talk_trivia_3'];
  const [currentTriviaKey, setCurrentTriviaKey] = useState<string>(TRIVIA_KEYS[0]);
  
  const [conversationLog, setConversationLog] = useState<{source: string, translated: string, timestamp: Date}[]>([]);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wakeLockRef = useRef<any>(null);

  const playSystemSound = (type: 'connecting' | 'connected' | 'disconnect') => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      if (type === 'connecting') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'connected') {
        const playBeep = (delay: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime + delay);
          gain.gain.setValueAtTime(0.12, ctx.currentTime + delay);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.08);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.08);
        };
        playBeep(0);
        playBeep(0.13);
      } else if (type === 'disconnect') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (e) {
      console.warn("Trình duyệt không hỗ trợ Web Audio API hoặc bị chặn autoplay:", e);
    }
  };

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log("Màn hình đã được khóa giữ sáng.");
      } catch (err) {
        console.warn("Không thể giữ sáng màn hình:", err);
      }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log("Đã giải phóng khóa giữ sáng màn hình.");
      } catch (err) {
        console.error(err);
      }
    }
  };

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible' && isListening) {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [isListening]);

  useEffect(() => {
    let progressInterval: NodeJS.Timeout;
    let triviaInterval: NodeJS.Timeout;

    if (isInitializing) {
      setConnectionProgress(0);
      const startTime = Date.now();
      progressInterval = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        const targetProgress = Math.min(90, Math.floor((elapsedTime / 10000) * 90));
        setConnectionProgress(targetProgress);
      }, 100);

      triviaInterval = setInterval(() => {
        setCurrentTriviaKey(prev => {
          const currentIndex = TRIVIA_KEYS.indexOf(prev);
          const nextIndex = (currentIndex + 1) % TRIVIA_KEYS.length;
          return TRIVIA_KEYS[nextIndex];
        });
      }, 3500);
    }

    return () => {
      clearInterval(progressInterval);
      clearInterval(triviaInterval);
    };
  }, [isInitializing]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sourceSubtitle, targetSubtitle]);
  
  const closeRealtimeStream = () => {
    if (isListening) {
      playSystemSound('disconnect');
      releaseWakeLock();
    }
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
      
      dataChannel.addEventListener("open", () => {
        playSystemSound('connected');
        requestWakeLock();
      });

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

      setConnectionProgress(100);
      await new Promise(resolve => setTimeout(resolve, 500));
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

  const handleMicClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isListening) {
      closeRealtimeStream();
    } else {
      playSystemSound('connecting');
      initRealtimeStream();
    }
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

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (conversationLog.length === 0 && !sourceSubtitle && !targetSubtitle) {
      showToast("Không có nội dung để chia sẻ", "info");
      return;
    }

    const finalLog = [...conversationLog];
    if (sourceSubtitle || targetSubtitle) {
      finalLog.push({
        source: sourceSubtitle,
        translated: targetSubtitle,
        timestamp: new Date()
      });
    }

    const textToShare = finalLog.map(l => `Ngữ cảnh gốc:\n${l.source}\n\nDịch thuật:\n${l.translated}`).join('\n\n---\n\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Cuộc trò chuyện (TalkTab)",
          text: textToShare,
        });
      } catch (err) {
        console.log("Người dùng hủy chia sẻ hoặc lỗi:", err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(textToShare);
        showToast("Đã sao chép vào khay nhớ tạm", "success");
      } catch (error) {
        showToast("Sao chép thất bại", "error");
      }
    }
  };

  const isLimitReached = usedSeconds >= QUOTA_LIMIT;

  return (
    <div className="flex flex-col h-full bg-surface shadow-sm border border-border-main rounded-3xl overflow-hidden relative pb-4 talk-tab-container">
      
      <div className="flex items-center justify-between p-4 border-b border-border-main bg-panel z-10">
        <div className="flex items-center gap-2">
           <Mic size={18} className="text-[#006D77]" />
           <span className="text-sm font-semibold text-text-main opacity-80">
             {t('live_translator') || 'Live Translator'}
           </span>
        </div>
        
        {/* Dropdown Ngôn ngữ chuyển lên đây */}
        <div className="relative">
          {/* Nút hiển thị giao diện giả lập sang trọng, tinh tế giống hệt cũ */}
          <div className="flex items-center gap-1 text-xs font-semibold text-[#006D77] bg-[#006D77]/10 px-3 py-1.5 rounded-full pointer-events-none">
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

      <div className="flex-1 p-6 flex flex-col pt-6 pb-24 relative">
        
        {/* Progress & Trivia (when initializing) */}
        {isInitializing && (
          <div className="absolute top-4 left-0 right-0 z-10 px-6 flex flex-col items-center">
            <div className="w-full max-w-sm h-1 bg-border-main rounded-full overflow-hidden mb-2">
              <div 
                className="h-full bg-[#006D77] transition-all duration-100 ease-linear"
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
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-panel via-panel/90 to-transparent border-t border-border-main/50 z-50 pb-8 grid grid-cols-3 items-center px-6">
        
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
                ? 'bg-[#006D77] text-white border-2 border-[#006D77] animate-pulse shadow-[#006D77]/30 scale-110' 
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
