import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Copy, RefreshCw, Clock, History as HistoryIcon, PenTool, Globe, Inbox, Mic } from 'lucide-react';
import { HistoryItem } from '../types';
import { useHistoryTab } from '../hooks/useHistoryTab';

interface HistoryTabProps {
  t: (key: string) => string;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  onReuse: (item: HistoryItem) => void;
}

export const HistoryTabMobile: React.FC<HistoryTabProps> = ({ t, showToast, onReuse }) => {
  const {
    filter,
    setFilter,
    loading,
    filteredHistory,
    handleCopy,
  } = useHistoryTab(t, showToast);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.getDate() === yesterday.getDate() && date.getMonth() === yesterday.getMonth() && date.getFullYear() === yesterday.getFullYear();

    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    if (isToday) return timeStr;
    if (isYesterday) return `${t('yesterday') || 'Yesterday'} ${timeStr}`;
    
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${timeStr}`;
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'translate': return <Globe size={18} className="text-blue-500" />;
      case 'compose': return <PenTool size={18} className="text-emerald-500" />;
      case 'talk': return <Mic size={18} className="text-[#006D77]" />;
      default: return <Clock size={18} className="text-gray-500" />;
    }
  };

  const getLabelForType = (type: string) => {
    switch (type) {
      case 'translate': return t('translate') || 'Translate';
      case 'compose': return t('compose') || 'Compose';
      case 'talk': return t('live_translate') || 'Live Translate';
      default: return type;
    }
  };

  type FilterType = 'all' | 'translate' | 'compose' | 'talk';

  return (
    <motion.div 
      key="history"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex flex-col h-full"
    >
      <div className="flex-none pt-12 pb-4 px-6 relative z-20">
        <h2 className="text-3xl font-bold text-text-main mb-4 tracking-tight flex items-center gap-3">
          <HistoryIcon className="text-accent" size={32} />
          {t('history') || 'History'}
        </h2>
        
        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {(['all', 'translate', 'compose', 'talk'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border ${
                filter === f 
                  ? 'bg-accent text-accent-on border-accent' 
                  : 'bg-panel border-border-main text-text-muted hover:text-text-main'
              }`}
            >
              {f === 'all' ? (t('all') || 'All') : getLabelForType(f)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-32 space-y-4 scroll-smooth">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-full text-text-muted opacity-60">
            <Inbox size={64} className="mb-4" />
            <p className="text-lg">{t('noHistory') || 'No history records found.'}</p>
          </div>
        ) : (
          <AnimatePresence>
            {filteredHistory.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-panel border-none rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.015)] p-4"
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    {getIconForType(item.type)}
                    <span className="text-[11px] font-medium tracking-widest uppercase text-slate-400">
                      {getLabelForType(item.type)}
                    </span>
                    {(item.fromLang || item.toLang) && (
                      <span className="text-xs text-slate-400 px-2 py-0.5 bg-gray-50 rounded-md">
                        {item.fromLang || 'Auto'} &rarr; {item.toLang || 'Unknown'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <Clock size={12} />
                    {formatTime(item.timestamp)}
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div className="bg-background/50 rounded-xl p-3 border border-border-main/50">
                    <p className="text-[13px] text-text-main whitespace-pre-wrap line-clamp-3">{item.input}</p>
                  </div>
                  <div className="bg-accent/5 rounded-xl p-3 border border-accent/10">
                    <p className="text-[13px] leading-relaxed text-text-main whitespace-pre-wrap">{item.output}</p>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => handleCopy(item.output)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-background hover:bg-background/80 border border-border-main rounded-lg text-sm font-medium transition-colors text-text-main"
                  >
                    <Copy size={16} />
                    {t('copy') || 'Copy'}
                  </button>
                  <button
                    onClick={() => onReuse(item)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/90 text-accent-on rounded-lg text-sm font-medium transition-colors"
                  >
                    <RefreshCw size={16} />
                    {t('reuse') || 'Reuse'}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
};
