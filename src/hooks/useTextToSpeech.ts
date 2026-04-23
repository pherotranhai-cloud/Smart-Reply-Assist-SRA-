import { useState, useCallback, useEffect, useRef } from 'react';

export const useTextToSpeech = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
      
      const loadVoices = () => {
        const voices = synthRef.current?.getVoices();
        if (voices && voices.length > 0) {
          setVoicesLoaded(true);
        }
      };

      // Initial check
      loadVoices();
      
      // Listen for voices changing
      if (synthRef.current.onvoiceschanged !== undefined) {
        synthRef.current.onvoiceschanged = loadVoices;
      }
    }
    
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, []);

  const speak = useCallback((text: string, lang: string): { success: boolean; message?: string } => {
    if (!synthRef.current) {
      return { success: false, message: 'Speech synthesis not supported in this browser.' };
    }

    if (!voicesLoaded) {
      return { success: false, message: 'Hệ thống giọng nói đang khởi động, vui lòng thử lại trong giây lát.' };
    }

    // Stop any ongoing speech
    stop();

    if (!text.trim()) {
      return { success: false, message: 'No text to speak.' };
    }

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Map application languages to BCP 47 language tags
      let langCode = 'en-US';
      if (lang === 'Vietnamese' || lang === 'vi') {
        langCode = 'vi-VN';
      } else if (lang === 'Chinese' || lang === 'zh' || lang === 'zh-TW') {
        langCode = 'zh-CN'; 
      } else if (lang === 'English' || lang === 'en') {
        langCode = 'en-US';
      }

      // 1. Detect actual content language to prevent 'interrupted' errors
      const detectLang = (text: string): string => {
        const rules = [
          { pattern: /[\u1000-\u109F]/, lang: 'my-MM' }, // Burmese
          { pattern: /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i, lang: 'vi-VN' }, // Vietnamese Latin Accents
          { pattern: /[\u4e00-\u9fa5]/, lang: 'zh-CN' }, // Chinese Hanzi
          { pattern: /\b(yang|dan|dengan|untuk|dari|ini|itu|tidak|pada|ke|dalam|kami|bahwa|juga|saya|bisa|ada|mereka|akan|menjadi)\b/i, lang: 'id-ID' }, // Indo heuristics
        ];

        for (const rule of rules) {
          if (rule.pattern.test(text)) {
            return rule.lang;
          }
        }
        return langCode; // Fallback to provided param if no strict match
      };

      const actualLang = detectLang(text);

      utterance.lang = actualLang;
      utterance.rate = 0.95; // Slightly slower for clarity
      utterance.pitch = 1.0;

      const voices = synthRef.current.getVoices();
      
      // 2. Find best matching voice (prioritize Google or Apple voices)
      const findVoice = (langPrefix: string) => {
        const matchingVoices = voices.filter(v => v.lang.startsWith(langPrefix));
        return matchingVoices.find(v => v.name.includes('Google') || v.name.includes('Apple')) || matchingVoices[0];
      };

      let selectedVoice = findVoice(actualLang) || findVoice(actualLang.split('-')[0]);

      // Fallback to English if absolutely no matching language is found
      if (!selectedVoice) {
         selectedVoice = findVoice('en');
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        // Chrome 15-second pause bug workaround
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(() => {
          if (synthRef.current?.speaking) {
            synthRef.current.pause();
            synthRef.current.resume();
          }
        }, 14000);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };

      utterance.onerror = (event) => {
        console.error('Final TTS Error:', event);
        if (synthRef.current) {
          synthRef.current.cancel(); // Reset the engine on error
        }
        setIsSpeaking(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };

      // 3. Small timeout to prevent the "interrupted" race condition
      setTimeout(() => {
        synthRef.current?.speak(utterance);
      }, 50);

      return { success: true };
    } catch (error) {
      console.error('Speech Synthesis trigger failed:', error);
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      setIsSpeaking(false);
      return { success: false, message: 'Đã xảy ra lỗi hệ thống, vui lòng thử lại.' };
    }
  }, [stop, voicesLoaded]);

  return { speak, stop, isSpeaking, voicesLoaded };
};
