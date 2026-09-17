import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { storage } from '../services/storage';
import { AIService } from '../services/ai';
import { matchGlossary } from '../services/glossary';
import { validateSecurity } from '../utils/security';
import { generateHash } from '../utils/hash';
import { Language, AppState, VocabItem, ConversationContext } from '../types';

interface UseTranslateTabParams {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  vocab: VocabItem[];
  t: (key: string) => string;
  showToast: (message: string, type?: 'info' | 'error' | 'success') => void;
  isListening: boolean;
  interimTranscript: string;
  activeTab: string;
  setContext: (context: ConversationContext | null) => void;
  stopSpeaking: () => void;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  transcript: string;
  setTranscript: React.Dispatch<React.SetStateAction<string>>;
}

export function useTranslateTab({
  state,
  setState,
  vocab,
  t,
  showToast,
  isListening,
  interimTranscript,
  activeTab,
  setContext,
  stopSpeaking,
  setLoading,
  setIsStreaming,
  transcript,
  setTranscript,
}: UseTranslateTabParams) {
  const [translateInput, setTranslateInput] = useState('');
  const [translateImage, setTranslateImage] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState<Language>('Vietnamese');
  const [isSummaryMode, setIsSummaryMode] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isCached, setIsCached] = useState(false);

  const handleClearInput = useCallback(() => {
    setTranslateInput('');
    setTranslateImage(null);
  }, []);

  /**
   * The same matcher AIService runs before it builds the prompt, so the chips
   * and the injected glossary are the same set by construction. It used to be a
   * second, different matcher here — it scanned `item.term`, which holds a
   * category label ("Component"), so the chips listed terms the model was never
   * told about and missed the ones it was.
   *
   * Matched against the typed input alone: OCR text only exists once a
   * translation is in flight, and AIService re-matches against the assembled
   * text at that point, so an attached image widens the injected glossary
   * without the chips claiming a term that is not on screen yet.
   */
  const matchedTerms = useMemo(
    () => matchGlossary(translateInput, vocab, targetLang),
    [translateInput, vocab, targetLang]
  );

  const handleTranslate = useCallback(async () => {
    stopSpeaking();
    if (isTranslating) return;

    if (!translateInput && !translateImage) {
      showToast(t('provideTextOrImage'), 'error');
      return;
    }

    const securityCheck = validateSecurity(translateInput);
    if (!securityCheck.isValid) {
      showToast(t(securityCheck.errorKey || 'SECURITY_FIREWALL_ERROR'), 'error');
      setLoading(false);
      return;
    }

    setIsTranslating(true);
    setLoading(true);

    const currentVocab = await storage.getVocab();
    const imageHash = translateImage ? translateImage.substring(0, 50) + translateImage.substring(translateImage.length - 50) : '';
    const hashKey = generateHash(translateInput + targetLang + imageHash);
    const cache = await storage.getTranslationCache();

    if (cache[hashKey]) {
      const cachedResult = cache[hashKey].translatedText;
      for (let i = 0; i <= cachedResult.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        setState(prev => ({
          ...prev,
          lastOutputs: { ...prev.lastOutputs, translatedText: cachedResult.substring(0, i) }
        }));
      }
      setIsCached(true);
      showToast(t('instantTranslation'), 'success');
      setLoading(false);
      setIsTranslating(false);
      return;
    }

    try {
      setIsCached(false);
      setLoading(true);

      const ai = new AIService(state.settings);
      let finalSourceText = translateInput;

      if (translateImage) {
        showToast(t('readingImage'), 'info');
        const extractedText = await ai.extractTextFromImage(translateImage);

        if (translateInput.trim()) {
          finalSourceText = `${translateInput}\n\n--- [Image Content] ---\n${extractedText}`;
        } else {
          finalSourceText = extractedText;
        }
        showToast(t('translating'), 'info');
      }

      setState(prev => ({
        ...prev,
        lastOutputs: { ...prev.lastOutputs, translatedText: '' }
      }));

      let fullTranslation = '';

      let hasReceivedFirstChunk = false;
      setIsStreaming(true);

      const result = await ai.translate(finalSourceText, targetLang, currentVocab, undefined, isSummaryMode, (chunk) => {
        if (!hasReceivedFirstChunk && chunk.trim()) {
          hasReceivedFirstChunk = true;
          setLoading(false);
        }
        fullTranslation += chunk;
        setState(prev => ({
          ...prev,
          lastOutputs: { ...prev.lastOutputs, translatedText: fullTranslation }
        }));
      });

      setIsStreaming(false);

      const newOutputs = { ...state.lastOutputs, translatedText: result, summary: '', contextSource: 'translated' as const };
      setState(prev => ({ ...prev, lastOutputs: newOutputs }));
      await storage.setLastOutputs(newOutputs);

      const newContext: ConversationContext = {
        sourceText: finalSourceText,
        translatedText: result,
        summaryText: '',
        targetTranslationLanguage: targetLang,
        lastUpdatedIso: new Date().toISOString(),
        contextSource: 'translated'
      };
      setContext(newContext);
      await storage.setContext(newContext);

      const historyItemToSave = {
        type: 'translate' as const,
        input: finalSourceText,
        output: result,
        toLang: targetLang,
        id: '',
        timestamp: Date.now()
      };

      await storage.addHistory(historyItemToSave);

      cache[hashKey] = { translatedText: result, timestamp: Date.now() };
      await storage.setTranslationCache(cache);

      showToast(t('translationUpdated'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
      setIsStreaming(false);
      setIsTranslating(false);
    }
  }, [translateInput, translateImage, targetLang, state.settings, state.lastOutputs, t, showToast, isSummaryMode, isTranslating, stopSpeaking, setLoading, setIsStreaming, setState, setContext]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setTranslateImage(event.target?.result as string);
        showToast(t('imageUploaded'), 'success');
      };
      reader.readAsDataURL(file);
    }
  }, [showToast, t]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            setTranslateImage(event.target?.result as string);
            showToast(t('imagePasted'), 'success');
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  }, [showToast, t]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
            setTranslateInput(prev => prev + (prev ? '\n' : '') + text);
        showToast(t('textPasted'), 'success');
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      showToast(t('clipboardDenied'), 'error');
    }
  }, [showToast, t]);

  // Owned here rather than in the tab components: the mobile and desktop
  // layouts would otherwise each run it, re-appending the transcript whenever
  // the viewport crossed the desktop breakpoint.
  useEffect(() => {
    if (transcript && activeTab === 'translate') {
      setTranslateInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript);
      setTranscript('');
    }
  }, [transcript, setTranscript, activeTab]);

  const tInterim = isListening && interimTranscript ? interimTranscript : '';
  const translateInputWithInterim = translateInput + (activeTab === 'translate' && tInterim ? (translateInput && !translateInput.endsWith(' ') ? ' ' : '') + tInterim : '');

  return {
    translateInput,
    setTranslateInput,
    translateImage,
    setTranslateImage,
    targetLang,
    setTargetLang,
    isSummaryMode,
    setIsSummaryMode,
    isTranslating,
    isCached,
    matchedTerms,
    handleTranslate,
    handleClearInput,
    handleImageUpload,
    handlePaste,
    handlePasteFromClipboard,
    translateInputWithInterim,
  };
}
