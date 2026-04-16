import { useState, useCallback, useEffect, useRef } from 'react';

export const useTextToSpeech = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
      // Pre-load voices
      synthRef.current.getVoices();
    }
    
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  const stop = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  }, []);

  const speak = useCallback((text: string, lang: string) => {
    if (!synthRef.current) return;

    // Stop any ongoing speech
    stop();

    if (!text) return;

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Map application languages to BCP 47 language tags
    let langCode = 'en-US';
    if (lang === 'Vietnamese' || lang === 'vi') {
      langCode = 'vi-VN';
    } else if (lang === 'Chinese' || lang === 'zh' || lang === 'zh-TW') {
      langCode = 'zh-CN'; // or zh-TW depending on availability
    } else if (lang === 'English' || lang === 'en') {
      langCode = 'en-US';
    }

    utterance.lang = langCode;
    utterance.rate = 0.95; // Slightly slower for clarity
    utterance.pitch = 1.0;

    const voices = synthRef.current.getVoices();
    
    // Try to find a matching voice
    let voice = voices.find(v => v.lang.startsWith(langCode));
    
    // Fallback logic for Chinese
    if (!voice && langCode === 'zh-CN') {
      voice = voices.find(v => v.lang.startsWith('zh'));
    }
    
    // Fallback logic for English
    if (!voice && langCode === 'en-US') {
      voice = voices.find(v => v.lang.startsWith('en'));
    }

    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (e) => {
      console.error('Speech synthesis error:', e);
      setIsSpeaking(false);
    };

    synthRef.current.speak(utterance);
  }, [stop]);

  return { speak, stop, isSpeaking };
};
