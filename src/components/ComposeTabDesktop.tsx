import React, { useState } from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { 
  PenTool, 
  Loader2, 
  Copy, 
  Check, 
  Share2, 
  Mic, 
  Square, 
  Volume2, 
  FileText, 
  FileSearch, 
  Clock, 
  HelpCircle, 
  Megaphone, 
  Settings2, 
  ChevronDown, 
  X 
} from 'lucide-react';
import { AppState, ConversationContext, Audience, Tone, Length, Format, Language } from '../types';
import { useComposeTab } from '../hooks/useComposeTab';

type ComposeTabState = ReturnType<typeof useComposeTab>;
import { VoiceVisualizer } from './common/VoiceVisualizer';
import { LANGUAGES, LANGUAGE_FLAGS, CORE_PRESETS } from '../constants';

const ICON_MAP: Record<string, React.ElementType> = {
  FileText,
  FileSearch,
  Clock,
  HelpCircle,
  Megaphone,
  Settings2
};

interface ComposeTabDesktopProps {
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
  isListening: boolean;
  interimTranscript: string;
  handleToggleListening: () => void;
  handleSpeak: (text: string, lang: string) => void;
  copyToClipboard: (text: string) => Promise<void>;
  isSpeaking: boolean;
  loading: boolean;
  transcript: string;
  setTranscript: React.Dispatch<React.SetStateAction<string>>;
  userPreferences?: any;
  /** Lifted into App so the text survives tab and layout changes. */
  compose: ComposeTabState;
}

export function ComposeTabDesktop(props: ComposeTabDesktopProps) {
  const {
    composeReq, setComposeReq, activePresetId, setActivePresetId,
    composeParams, setComposeParams, 
    handleCompose
  } = props.compose;

  const hasBgImage = !!props.userPreferences?.backgroundImage || (props.userPreferences?.backgroundEffect && props.userPreferences.backgroundEffect !== 'none');

  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const tInterim = props.isListening && props.interimTranscript ? props.interimTranscript : '';
  const composeInputWithInterim = composeReq + (props.activeTab === 'compose' && tInterim ? (composeReq && !composeReq.endsWith(' ') ? ' ' : '') + tInterim : '');

  const handleCopy = async (text: string) => {
    await props.copyToClipboard(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleShare = async () => {
    const text = props.state.lastOutputs.generatedReply;
    if (!text) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: props.state.lastOutputs.subject || 'Generated Reply',
          text: text,
        });
      } catch (e) {}
    } else {
      handleCopy(text);
    }
  };

  return (
    <div className={`flex flex-col h-full min-h-0 transition-all duration-300 ${
      hasBgImage ? 'bg-transparent' : 'bg-app'
    }`}>
      {/* Top Bar: Horizontal Preset Bar */}
      <div className={`flex flex-wrap items-center justify-between gap-4 p-4 border-b border-border-main flex-shrink-0 transition-all duration-300 ${
        hasBgImage ? 'bg-panel/20 backdrop-blur-md' : 'bg-panel'
      }`}>
        <div className="flex items-center gap-3">
          <PenTool size={20} className="text-accent shrink-0" />
          <h2 className="font-semibold text-lg text-text-main whitespace-nowrap">{props.t('compose')}</h2>
        </div>

        {/* Preset list */}
        <div className="flex flex-wrap items-center gap-2">
          {CORE_PRESETS.filter(p => p.id !== 'custom').map((preset) => {
            const isActive = activePresetId === preset.id;
            const IconComponent = ICON_MAP[preset.iconName] || FileText;
            return (
              <button
                key={preset.id}
                onClick={() => {
                  setActivePresetId(preset.id);
                  setComposeParams(prev => ({ ...prev, ...preset.settings }));
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-accent text-white shadow-sm shadow-accent/25'
                    : 'bg-panel text-text-muted hover:text-text-main hover:bg-border-main/50'
                }`}
              >
                <IconComponent size={16} />
                <span>{preset.name}</span>
              </button>
            );
          })}

          {/* Custom Button */}
          <button
            onClick={() => setIsCustomModalOpen(true)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
              activePresetId === 'custom'
                ? 'bg-accent/10 text-accent border border-accent/20'
                : 'bg-panel text-text-muted hover:text-text-main hover:bg-border-main/50 border border-transparent'
            }`}
          >
            <Settings2 size={16} />
            <span>{props.t('custom') || 'Tùy chỉnh'}</span>
          </button>
        </div>
      </div>

      {/* Main Workspace split into 2 equal height or full-height columns */}
      <div className={`grid grid-cols-2 gap-6 w-full h-[calc(100vh-180px)] min-h-0 overflow-hidden pb-4 p-6 transition-all duration-300 ${
        hasBgImage ? 'bg-transparent' : 'bg-app'
      }`}>
        {/* Left Column: Input (Yêu cầu thêm) */}
        <div className={`flex flex-col h-full min-h-0 border border-border-main rounded-3xl p-5 justify-between transition-all duration-300 ${
          hasBgImage ? 'bg-panel/20 backdrop-blur-md' : 'bg-panel'
        }`}>
          <div className="flex items-center justify-between pb-3 border-b border-border-main flex-shrink-0">
            <span className="text-sm font-semibold text-text-muted uppercase tracking-wider">
              {props.t('additionalReqs')}
            </span>
            {activePresetId && (
              <span className="text-xs font-medium text-accent bg-accent/10 px-2.5 py-1 rounded-full">
                {CORE_PRESETS.find(p => p.id === activePresetId)?.name}
              </span>
            )}
          </div>

          <textarea
            value={composeInputWithInterim}
            onChange={(e) => setComposeReq(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCompose();
              }
            }}
            placeholder={props.t('composePlaceholder')}
            className="flex-1 w-full h-full overflow-y-auto resize-none bg-transparent focus:outline-none focus:ring-0 custom-scrollbar text-text-main text-base my-3 border-none p-0"
          />

          <div className="pt-4 border-t border-border-main flex items-center justify-between bg-transparent flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={props.handleToggleListening}
                className={`p-2.5 rounded-xl transition-all ${
                  props.isListening 
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse' 
                    : 'text-text-muted hover:text-accent hover:bg-accent/10'
                }`}
                title={props.isListening ? props.t('listeningActive') : props.t('startVoice') || 'Nói'}
              >
                {props.isListening ? <Square size={20} /> : <Mic size={20} />}
              </button>
              {props.isListening && <VoiceVisualizer isListening={true} onClick={props.handleToggleListening} />}
            </div>
            <button
              onClick={handleCompose}
              disabled={props.loading || (!composeReq.trim() && !props.context)}
              className="px-6 py-2.5 bg-[#006D77] hover:bg-[#005c65] text-white rounded-xl font-semibold shadow-md shadow-[#006D77]/25 disabled:opacity-50 disabled:shadow-none transition-all flex items-center gap-2 text-sm"
            >
              {props.loading ? <Loader2 size={16} className="animate-spin" /> : <PenTool size={16} />}
              <span>{props.t('generateReply')}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Generated Reply / Output Editor */}
        <div className={`flex flex-col h-full min-h-0 border border-border-main rounded-3xl p-5 justify-between relative transition-all duration-300 ${
          hasBgImage ? 'bg-panel/20 backdrop-blur-md' : 'bg-panel'
        }`}>
          {/* Target Language selector: Ghost Native Select */}
          <div className={`absolute top-4 right-4 z-10 flex items-center gap-2 border border-border-main p-1.5 rounded-xl shadow-sm transition-all duration-300 ${
            hasBgImage ? 'bg-panel/40 backdrop-blur-md' : 'bg-panel/80'
          }`}>
            <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider pl-1">{props.t('language') || 'Ngôn ngữ'}:</span>
            <div className="relative inline-block w-40">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-accent bg-accent/10 px-3 py-1.5 rounded-lg pointer-events-none w-full justify-between border border-border-main">
                <span className="text-text-main">{LANGUAGE_FLAGS[composeParams.lang]} {composeParams.lang}</span>
                <ChevronDown size={14} className="text-text-muted shrink-0" />
              </div>
              <select 
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-20"
                value={composeParams.lang}
                onChange={e => setComposeParams(p => ({ ...p, lang: e.target.value as Language }))}
              >
                {LANGUAGES.filter(l => l !== 'Auto').map(l => <option key={l} value={l} className="bg-panel text-text-main">{LANGUAGE_FLAGS[l]} {l}</option>)}
              </select>
            </div>
          </div>

          <div className="flex-1 w-full overflow-y-auto custom-scrollbar my-4 pr-2 text-text-main pt-16">
            {props.loading ? (
              <div className="flex flex-col items-center justify-center h-full text-text-muted gap-4">
                <Loader2 size={32} className="animate-spin text-accent" />
                <p className="font-medium animate-pulse">{props.t('generating') || 'Đang soạn thảo...'}</p>
              </div>
            ) : props.state.lastOutputs.generatedReply ? (
              <div className="flex flex-col gap-4">
                {props.state.lastOutputs.subject && (
                  <div className="text-lg font-bold text-text-main border-b border-border-main pb-2">
                    {props.state.lastOutputs.subject}
                  </div>
                )}
                <div className="markdown-body prose dark:prose-invert max-w-none text-lg">
                  <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {props.state.lastOutputs.generatedReply}
                  </Markdown>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted opacity-50 text-lg">
                {props.t('composeOutputPlaceholder')}
              </div>
            )}
          </div>

          {props.state.lastOutputs.generatedReply && !props.loading && (
            <div className="pt-4 border-t border-border-main flex items-center justify-end gap-2 bg-transparent flex-shrink-0">
              <button
                onClick={() => props.handleSpeak(props.state.lastOutputs.generatedReply!, composeParams.lang)}
                disabled={props.isSpeaking}
                className="p-3 text-text-muted hover:text-accent hover:bg-accent/10 rounded-xl transition-colors disabled:opacity-50"
                title="Speak"
              >
                <Volume2 size={20} className={props.isSpeaking ? 'animate-pulse text-accent' : ''} />
              </button>
              <button
                onClick={handleShare}
                className="p-3 text-text-muted hover:text-accent hover:bg-accent/10 rounded-xl transition-colors"
                title="Share"
              >
                <Share2 size={20} />
              </button>
              <button
                onClick={() => handleCopy(props.state.lastOutputs.generatedReply!)}
                className="p-3 text-white bg-accent hover:bg-accent/90 rounded-xl shadow-sm transition-colors flex items-center gap-2"
              >
                {isCopied ? <Check size={20} /> : <Copy size={20} />}
                <span className="font-medium">{isCopied ? 'Đã chép' : 'Sao chép'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Custom Parameters Modal */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-panel border border-border-main rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-border-main bg-panel">
              <h3 className="font-semibold text-text-main text-lg">{props.t('customConfiguration') || 'Cấu hình Tùy chỉnh'}</h3>
              <button onClick={() => setIsCustomModalOpen(false)} className="text-text-muted hover:text-red-500 transition-colors p-1 rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Audience */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold tracking-widest text-text-muted uppercase">{props.t('audience') || 'Đối tượng'}</label>
                <select 
                  className="w-full bg-app text-text-main border border-border-main rounded-xl p-2.5 focus:ring-1 focus:ring-accent focus:outline-none"
                  value={composeParams.audience}
                  onChange={e => {
                    setComposeParams(p => ({ ...p, audience: e.target.value as Audience }));
                    setActivePresetId('custom');
                  }}
                >
                  <option value="cross_dept">Phòng ban khác (Cross-Departments)</option>
                  <option value="external">Đối tác ngoài (External)</option>
                  <option value="management">Cấp trên (Top Management)</option>
                  <option value="team">Team nội bộ (Subordinates)</option>
                  <option value="brand_client">Khách hàng Brand (Brand Client)</option>
                  <option value="expert">Chuyên gia / Tư vấn viên (Expert)</option>
                </select>
              </div>

              {/* Tone */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold tracking-widest text-text-muted uppercase">{props.t('tone') || 'Giọng điệu'}</label>
                <select 
                  className="w-full bg-app text-text-main border border-border-main rounded-xl p-2.5 focus:ring-1 focus:ring-accent focus:outline-none"
                  value={composeParams.tone}
                  onChange={e => {
                    setComposeParams(p => ({ ...p, tone: e.target.value as Tone }));
                    setActivePresetId('custom');
                  }}
                >
                  <option value="professional">Chuyên nghiệp (Professional)</option>
                  <option value="friendly">Thân thiện (Friendly)</option>
                  <option value="direct">Thẳng thắn (Direct)</option>
                  <option value="diplomatic">Khéo léo (Diplomatic)</option>
                  <option value="strict_urgent">Nghiêm ngặt & Khẩn cấp (Strict & Urgent)</option>
                  <option value="collaborative">Hợp tác & Nhờ hỗ trợ (Collaborative)</option>
                  <option value="persuasive">Thuyết phục (Persuasive)</option>
                  <option value="humble">Khiêm tốn (Humble)</option>
                </select>
              </div>

              {/* Length */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold tracking-widest text-text-muted uppercase">{props.t('length') || 'Độ dài'}</label>
                <select 
                  className="w-full bg-app text-text-main border border-border-main rounded-xl p-2.5 focus:ring-1 focus:ring-accent focus:outline-none"
                  value={composeParams.length}
                  onChange={e => {
                    setComposeParams(p => ({ ...p, length: e.target.value as Length }));
                    setActivePresetId('custom');
                  }}
                >
                  <option value="short">Ngắn gọn (Short)</option>
                  <option value="standard">Tiêu chuẩn (Standard)</option>
                  <option value="detailed">Chi tiết (Detailed)</option>
                </select>
              </div>

              {/* Format */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold tracking-widest text-text-muted uppercase">{props.t('format') || 'Định dạng'}</label>
                <select 
                  className="w-full bg-app text-text-main border border-border-main rounded-xl p-2.5 focus:ring-1 focus:ring-accent focus:outline-none"
                  value={composeParams.format}
                  onChange={e => {
                    setComposeParams(p => ({ ...p, format: e.target.value as Format }));
                    setActivePresetId('custom');
                  }}
                >
                  <option value="wechat_zalo">Tin nhắn (Zalo/WeChat Message)</option>
                  <option value="formal_email">Email trang trọng (Formal Email)</option>
                  <option value="bullet_points">Gạch đầu dòng (Action Items)</option>
                </select>
              </div>
            </div>

            <div className="p-4 border-t border-border-main bg-panel flex justify-end gap-3">
              <button 
                onClick={() => setIsCustomModalOpen(false)}
                className="px-5 py-2 rounded-xl text-text-muted hover:bg-app transition-colors font-medium text-sm"
              >
                Đóng
              </button>
              <button 
                onClick={() => {
                  setActivePresetId('custom');
                  setIsCustomModalOpen(false);
                }}
                className="px-5 py-2 bg-accent text-white rounded-xl hover:bg-accent/90 transition-colors font-semibold shadow-md shadow-accent/20 text-sm"
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
