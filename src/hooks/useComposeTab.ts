import { useState, useRef, useCallback, useEffect } from 'react';
import { storage } from '../services/storage';
import { AIService } from '../services/ai';
import { validateSecurity } from '../utils/security';
import { splitEmailSubject } from '../../shared/emailSubject';
import { AppState, ConversationContext, Audience, Tone, Length, Format, Language } from '../types';

interface UseComposeTabParams {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  vocab: any[];
  t: (key: string) => string;
  showToast: (message: string, type?: 'info' | 'error' | 'success') => void;
  activeTab: string;
  context: ConversationContext | null;
  stopSpeaking: () => void;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  handleExtract: (text: string, sourceLang: string, contextSource: 'original' | 'translated') => Promise<any>;
  transcript: string;
  setTranscript: React.Dispatch<React.SetStateAction<string>>;
}

export function useComposeTab({
  state,
  setState,
  vocab,
  t,
  showToast,
  activeTab,
  context,
  stopSpeaking,
  setLoading,
  handleExtract,
  transcript,
  setTranscript,
}: UseComposeTabParams) {
  const [composeReq, setComposeReq] = useState('');
  const [activePresetId, setActivePresetId] = useState('custom');
  const [composeParams, setComposeParams] = useState({
    audience: 'cross_dept' as Audience,
    tone: 'professional' as Tone,
    length: 'standard' as Length,
    lang: 'English' as Language,
    format: 'wechat_zalo' as Format
  });
  const [useContextInCompose, setUseContextInCompose] = useState(false);

  const composeCacheRef = useRef<Map<string, string>>(new Map());

  // See the matching note in useTranslateTab: owned by the hook so the mobile
  // and desktop layouts cannot both append the same transcript.
  useEffect(() => {
    if (transcript && activeTab === 'compose') {
      setComposeReq(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + transcript);
      setTranscript('');
    }
  }, [transcript, setTranscript, activeTab]);

  const handleCompose = useCallback(async () => {
    stopSpeaking();
    const currentContext = useContextInCompose ? context : null;
    const hasContext = currentContext && (currentContext.sourceText || currentContext.translatedText);

    if (!composeReq.trim() && !hasContext) {
      showToast(t('provideRequirements'), 'error');
      return;
    }

    const securityCheck = validateSecurity(composeReq);
    if (!securityCheck.isValid) {
      showToast(t(securityCheck.errorKey || 'SECURITY_FIREWALL_ERROR'), 'error');
      setLoading(false);
      return;
    }

    const goal = activePresetId === 'custom' ? 'Custom' : activePresetId.charAt(0).toUpperCase() + activePresetId.slice(1);
    // Every input that changes the reply belongs in the key: all compose
    // params (format, audience and length used to be missing, so changing them
    // replayed the old reply) and which context, if any, the reply is built on.
    const cacheKey = JSON.stringify([
      composeReq,
      composeParams,
      goal,
      hasContext ? currentContext.lastUpdatedIso : null,
    ]);

    if (composeCacheRef.current.has(cacheKey)) {
      const cachedResult = composeCacheRef.current.get(cacheKey)!;
      
      const { subject, body } = composeParams.format === 'formal_email'
        ? splitEmailSubject(cachedResult)
        : { subject: '', body: cachedResult };

      // Typewriter effect
      for (let i = 0; i <= body.length; i += 2) {
        await new Promise(resolve => setTimeout(resolve, 5));
        setState(prev => ({ 
          ...prev, 
          lastOutputs: { ...prev.lastOutputs, generatedReply: body.substring(0, i), subject } 
        }));
      }

      setState(prev => ({ 
        ...prev, 
        lastOutputs: { ...prev.lastOutputs, generatedReply: body, subject }
      }));
      showToast(t('replyGenerated'), 'success');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const ai = new AIService(state.settings);
      
      let contextText = '';
      let currentStructuredSummary = null;

      if (currentContext && (currentContext.sourceText || currentContext.translatedText)) {
        contextText = state.lastOutputs.contextSource === 'original' 
          ? currentContext.sourceText 
          : currentContext.translatedText;
        
        currentStructuredSummary = state.structuredSummary;
        const isStale = !currentStructuredSummary || 
          new Date(currentContext.lastUpdatedIso) > new Date(currentStructuredSummary.meta.extractedAtIso);
        
        if (isStale) {
          const sourceLang = currentContext.targetTranslationLanguage || 'Auto';
          currentStructuredSummary = await handleExtract(contextText, sourceLang, state.lastOutputs.contextSource || 'translated');
        }
      }

      let fullReply = '';
      
      setState(prev => ({ 
        ...prev, 
        lastOutputs: { ...prev.lastOutputs, generatedReply: '', subject: '' } 
      }));

      const result = await ai.compose(
        contextText,
        composeReq, 
        {
          audience: composeParams.audience,
          tone: composeParams.tone,
          length: composeParams.length,
          lang: composeParams.lang,
          format: composeParams.format,
          goal: activePresetId === 'custom' ? 'Custom' : activePresetId.charAt(0).toUpperCase() + activePresetId.slice(1)
        }, 
        vocab,
        currentStructuredSummary || undefined,
        (chunk) => {
          fullReply += chunk;
          
          const { subject, body } = composeParams.format === 'formal_email'
            ? splitEmailSubject(fullReply)
            : { subject: '', body: fullReply };

          setState(prev => ({ 
            ...prev, 
            lastOutputs: { ...prev.lastOutputs, generatedReply: body, subject } 
          }));
        }
      );

      const { subject, body } = composeParams.format === 'formal_email'
        ? splitEmailSubject(result)
        : { subject: '', body: result };

      const newOutputs = { 
        ...state.lastOutputs, 
        generatedReply: body, 
        subject
      };
      
      composeCacheRef.current.set(cacheKey, result);

      setState(prev => ({ ...prev, lastOutputs: newOutputs }));
      await storage.setLastOutputs(newOutputs);
      await storage.addHistory({ 
        type: 'compose', 
        input: composeReq, 
        output: result,
        toLang: composeParams.lang,
        meta: {
          tone: composeParams.tone,
          format: composeParams.format
        }
      });
      showToast(t('replyGenerated'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [composeReq, composeParams, context, useContextInCompose, state.settings, state.lastOutputs, state.structuredSummary, vocab, handleExtract, t, showToast, activePresetId, setLoading, setState, stopSpeaking]);

  return {
    composeReq,
    setComposeReq,
    activePresetId,
    setActivePresetId,
    composeParams,
    setComposeParams,
    useContextInCompose,
    setUseContextInCompose,
    handleCompose,
  };
}
