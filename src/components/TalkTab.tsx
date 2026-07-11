import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Square, RotateCcw, Globe } from 'lucide-react';
import { LANGUAGE_FLAGS } from '../constants';
import { safeLocalStorage } from '../utils/safeStorage';
import { nativeBypassFetch } from '../App';

const ALL_LANGUAGES = ['Vietnamese', 'Chinese (Simplified)', 'Chinese (Traditional)', 'English', 'Indonesian', 'Burmese'] as const;

interface TalkTabProps {
  settings: any;
  vocab: any[];
  t: (key: string) => string;
}

export const TalkTab: React.FC<TalkTabProps> = ({ settings, vocab, t }) => {
  const [userLang, setUserLang] = useState<string>(() => safeLocalStorage.getItem('talk_user_lang') || 'Vietnamese');
  const [partnerLang, setPartnerLang] = useState<string>(() => safeLocalStorage.getItem('talk_partner_lang') || 'Chinese (Simplified)');
  
  useEffect(() => { safeLocalStorage.setItem('talk_user_lang', userLang); }, [userLang]);
  useEffect(() => { safeLocalStorage.setItem('talk_partner_lang', partnerLang); }, [partnerLang]);

  const [activeSpeaker, setActiveSpeaker] = useState<'user' | 'partner' | null>(null);
  const [sourceSubtitle, setSourceSubtitle] = useState<string>('');
  const [targetSubtitle, setTargetSubtitle] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState(false);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  
  // Context Menu State
  const [menuOpenFor, setMenuOpenFor] = useState<'user' | 'partner' | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressOccurred = useRef(false);
  const [dragHoverLang, setDragHoverLang] = useState<string | null>(null);

  const closeRealtimeStream = () => {
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
    setActiveSpeaker(null);
    setIsInitializing(false);
  };

  useEffect(() => {
    return () => {
      closeRealtimeStream();
    };
  }, []);

  const getLanguageCode = (lang: string) => {
    if (lang === 'Vietnamese') return 'vi';
    if (lang.includes('Chinese')) return 'zh';
    if (lang === 'English') return 'en';
    if (lang === 'Indonesian') return 'id';
    if (lang === 'Burmese') return 'my';
    return 'en';
  };

  const initRealtimeStream = async (speaker: 'user' | 'partner') => {
    if (activeSpeaker) {
      closeRealtimeStream();
      return;
    }

    try {
      setIsInitializing(true);
      setActiveSpeaker(speaker);
      setSourceSubtitle('');
      setTargetSubtitle('');

      const targetLangName = speaker === 'user' ? partnerLang : userLang;
      const targetLang = getLanguageCode(targetLangName);
      
      const SERVER_BASE_URL = import.meta.env.VITE_RENDER_SERVER_URL || import.meta.env.VITE_API_URL || '';
      
      const sessionRes = await nativeBypassFetch(`${SERVER_BASE_URL}/api/realtime/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLang })
      });
      const sessionData = await sessionRes.json();
      if (!sessionData.client_secret || !sessionData.client_secret.value) {
        throw new Error('Failed to obtain client secret from Render Server');
      }
      const ephemeralKey = sessionData.client_secret.value;

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
      
      dataChannel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "response.audio_transcript.delta") {
            setTargetSubtitle(prev => prev + message.delta);
          } else if (message.type === "session.output_transcript.delta") {
            setTargetSubtitle(prev => prev + message.delta);
          } else if (message.type === "session.input_transcript.delta" || message.type === "conversation.item.input_audio_transcription.completed") {
             if (message.delta) {
               setSourceSubtitle(prev => prev + message.delta);
             } else if (message.transcript) {
               setSourceSubtitle(message.transcript);
             }
          }
        } catch (e) {
          console.error("Data channel parse error", e);
        }
      };

      dataChannel.onopen = () => {
         // Send an event to update session if needed
         dataChannel.send(JSON.stringify({
           type: 'session.update',
           session: {
             modalities: ['audio', 'text'],
             instructions: `Translate the spoken input to ${targetLangName}.`
           }
         }));
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-realtime-preview-2024-12-17";
      const sdpResponse = await nativeBypassFetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
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

    } catch (error) {
      console.error("Realtime Stream Error:", error);
      alert("Vui lòng cấp quyền truy cập Micro để sử dụng TalkTab hoặc kiểm tra lại kết nối.");
      closeRealtimeStream();
    } finally {
      setIsInitializing(false);
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
      closeRealtimeStream();
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
      longPressOccurred.current = false;
      return;
    }

    if (menuOpenFor === speaker) {
      setMenuOpenFor(null);
    } else if (!menuOpenFor) {
      if (activeSpeaker === speaker) {
        closeRealtimeStream();
      } else {
        initRealtimeStream(speaker);
      }
    }
  };

  const selectLanguage = (lang: string) => {
    if (menuOpenFor === 'user') setUserLang(lang);
    if (menuOpenFor === 'partner') setPartnerLang(lang);
    setMenuOpenFor(null);
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
      </div>

      <div className="flex-1 p-6 space-y-6 flex flex-col items-center justify-center pt-6 pb-40">
        
        {activeSpeaker ? (
          <div className="flex flex-col items-center w-full gap-8">
            <div className="w-full text-center space-y-2">
               <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Source</p>
               <p className="text-xl font-medium opacity-80 min-h-[3rem] transition-all">
                 {sourceSubtitle || "Listening..."}
               </p>
            </div>
            
            <div className="w-12 h-[1px] bg-border-main" />
            
            <div className="w-full text-center space-y-2">
               <p className="text-xs text-[#006D77] uppercase tracking-widest font-semibold">Translation</p>
               <p className="text-2xl font-semibold text-[#006D77] min-h-[3rem] transition-all">
                 {targetSubtitle || (isInitializing ? "Connecting..." : "...")}
               </p>
            </div>
          </div>
        ) : (
          <div className="text-center opacity-40">
            <Globe size={48} className="mx-auto mb-4" />
            <p>Tap a microphone to start real-time translation</p>
          </div>
        )}

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
                <div className="text-[11px] font-medium tracking-widest text-slate-400 uppercase px-3 py-2">Select Partner Lang</div>
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
                : 'bg-panel text-text-muted border-2 border-border-main hover:bg-bg-input'
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
                <div className="text-[11px] font-medium tracking-widest text-slate-400 uppercase px-3 py-2">Select Your Lang</div>
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
                : 'bg-panel text-accent border-2 border-accent/40 shadow-accent/10 hover:bg-bg-input'
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
