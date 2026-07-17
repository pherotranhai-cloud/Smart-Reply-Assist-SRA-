import { useState, useRef, useCallback } from 'react';
import { storage } from '../services/storage';
import { AIService } from '../services/ai';
import { validateSecurity } from '../utils/security';
import { AppState, ConversationContext, Audience, Tone, Length, Format, Language } from '../types';

interface UseComposeTabParams {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  vocab: any[];
  t: (key: string) => string;
  showToast: (message: string, type?: 'info' | 'error' | 'success') => void;
  activeTab: string;
  context: ConversationContext | null;
  checkRateLimit: () => boolean;
  stopSpeaking: () => void;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  handleExtract: (text: string, sourceLang: string, contextSource: 'original' | 'translated') => Promise<any>;
}

export function useComposeTab({
  state,
  setState,
  vocab,
  t,
  showToast,
  activeTab,
  context,
  checkRateLimit,
  stopSpeaking,
  setLoading,
  handleExtract,
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

  const handleCompose = useCallback(async () => {
    stopSpeaking();
    const currentContext = useContextInCompose ? context : null;
    const hasContext = currentContext && (currentContext.sourceText || currentContext.translatedText);

    if (!composeReq.trim() && !hasContext) {
      showToast(t('provideRequirements'), 'error');
      return;
    }

    if (!checkRateLimit()) return;

    const securityCheck = validateSecurity(composeReq);
    if (!securityCheck.isValid) {
      showToast(t(securityCheck.errorKey || 'SECURITY_FIREWALL_ERROR'), 'error');
      setLoading(false);
      return;
    }

    const goal = activePresetId === 'custom' ? 'Custom' : activePresetId.charAt(0).toUpperCase() + activePresetId.slice(1);
    const cacheKey = `${composeReq}-${composeParams.lang}-${composeParams.tone}-${goal}`;

    if (composeCacheRef.current.has(cacheKey)) {
      const cachedResult = composeCacheRef.current.get(cacheKey)!;
      
      let subject = '';
      let body = cachedResult;
      if (composeParams.format === 'formal_email' && cachedResult.toLowerCase().startsWith('subject:')) {
        const lines = cachedResult.split('\n');
        subject = lines[0].replace(/subject:/i, '').trim();
        body = lines.slice(1).join('\n').trim();
      }

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
          
          let subject = '';
          let body = fullReply;
          if (composeParams.format === 'formal_email' && fullReply.toLowerCase().startsWith('subject:')) {
            const lines = fullReply.split('\n');
            subject = lines[0].replace(/subject:/i, '').trim();
            body = lines.slice(1).join('\n').trim();
          }

          setState(prev => ({ 
            ...prev, 
            lastOutputs: { ...prev.lastOutputs, generatedReply: body, subject } 
          }));
        }
      );

      let subject = '';
      let body = result;
      if (composeParams.format === 'formal_email' && result.toLowerCase().startsWith('subject:')) {
        const lines = result.split('\n');
        subject = lines[0].replace(/subject:/i, '').trim();
        body = lines.slice(1).join('\n').trim();
      }

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
  }, [composeReq, composeParams, context, useContextInCompose, state.settings, state.lastOutputs, state.structuredSummary, vocab, handleExtract, t, showToast, activePresetId, checkRateLimit, setLoading, setState, stopSpeaking]);

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
