import { useState, useRef, useCallback, useEffect } from 'react';
import { storage } from '../services/storage';
import { presetById } from '../constants';
import { AIService } from '../services/ai';
import { validateSecurity } from '../utils/security';
import { AppState, Audience, Tone, Length, Format, Language } from '../types';

interface UseComposeTabParams {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  vocab: any[];
  t: (key: string) => string;
  showToast: (message: string, type?: 'info' | 'error' | 'success') => void;
  activeTab: string;
  stopSpeaking: () => void;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
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
  stopSpeaking,
  setLoading,
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

    if (!composeReq.trim()) {
      showToast(t('provideRequirements'), 'error');
      return;
    }

    const securityCheck = validateSecurity(composeReq);
    if (!securityCheck.isValid) {
      showToast(t(securityCheck.errorKey || 'SECURITY_FIREWALL_ERROR'), 'error');
      return;
    }

    const { goal } = presetById(activePresetId);

    // Every parameter that reaches the prompt has to be in the key. It used to
    // track only language, tone and goal, so recomposing the same requirement
    // as a formal email replayed the Zalo message cached a moment earlier —
    // and each format now produces a genuinely different document, so the
    // stale hit looks like the generator ignoring the picker. The separator is
    // a unit separator rather than '-' because a typed requirement contains
    // dashes, and "a-b" + "c" must not key the same as "a" + "b-c".
    const cacheKey = [
      composeReq,
      composeParams.lang,
      composeParams.audience,
      composeParams.tone,
      composeParams.length,
      composeParams.format,
      goal,
    ].join('\u001f');

    // Held for the replay too, not just the request: the typewriter below runs
    // for as long as a live stream, and with loading false the Generate button
    // stayed enabled, so a second tap raced a second replay into the same
    // output.
    setLoading(true);
    try {
      const cachedResult = composeCacheRef.current.get(cacheKey);
      if (cachedResult !== undefined) {
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
        return;
      }

      const ai = new AIService(state.settings);

      let fullReply = '';
      
      setState(prev => ({ 
        ...prev, 
        lastOutputs: { ...prev.lastOutputs, generatedReply: '', subject: '' } 
      }));

      const result = await ai.compose(
        composeReq,
        {
          audience: composeParams.audience,
          tone: composeParams.tone,
          length: composeParams.length,
          lang: composeParams.lang,
          format: composeParams.format,
          goal
        }, 
        vocab,
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
  }, [composeReq, composeParams, state.settings, state.lastOutputs, vocab, t, showToast, activePresetId, setLoading, setState, stopSpeaking]);

  return {
    composeReq,
    setComposeReq,
    activePresetId,
    setActivePresetId,
    composeParams,
    setComposeParams,
    handleCompose,
  };
}
