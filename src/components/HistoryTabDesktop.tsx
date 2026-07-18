import React from 'react';
import { Copy, RefreshCw, Clock, Globe, PenTool, Mic, Search } from 'lucide-react';
import { HistoryItem } from '../types';
import { useHistoryTab } from '../hooks/useHistoryTab';

interface HistoryTabDesktopProps {
  t: (key: string) => string;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  onReuse: (item: HistoryItem) => void;
  userPreferences?: any;
}

export const HistoryTabDesktop: React.FC<HistoryTabDesktopProps> = ({ t, showToast, onReuse, userPreferences }) => {
  const {
    filter, setFilter, loading, filteredHistory, handleCopy,
  } = useHistoryTab(t, showToast);

  const hasBgImage = !!userPreferences?.backgroundImage || (userPreferences?.backgroundEffect && userPreferences.backgroundEffect !== 'none');

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${timeStr}`;
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'translate': return <Globe size={18} className="text-blue-500" />;
      case 'compose': return <PenTool size={18} className="text-purple-500" />;
      case 'talk': return <Mic size={18} className="text-red-500" />;
      default: return <Clock size={18} className="text-text-muted" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'translate': return t('tabTranslate');
      case 'compose': return t('tabCompose');
      case 'talk': return t('live_translate');
      default: return type;
    }
  };

  return (
    <div className={`flex flex-col h-[calc(100vh-140px)] min-h-0 overflow-hidden w-full border border-border-main rounded-3xl p-6 justify-between transition-all duration-300 ${
      hasBgImage ? 'bg-panel/20 backdrop-blur-md' : 'bg-panel'
    }`}>
      <div className="flex items-center justify-between pb-4 border-b border-border-main flex-shrink-0">
        <h2 className="text-2xl font-bold text-text-main flex items-center gap-3">
          <Clock className="text-accent" size={28} />
          {t('history')}
        </h2>
        
        <div className={`flex items-center gap-2 p-1.5 rounded-xl border border-border-main transition-all duration-300 ${
          hasBgImage ? 'bg-panel/10' : 'bg-app'
        }`}>
          {(['all', 'translate', 'compose', 'talk'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f 
                  ? 'bg-accent text-white shadow-sm' 
                  : 'text-text-muted hover:text-text-main hover:bg-panel'
              }`}
            >
              {f === 'all' ? t('all') : getTypeLabel(f)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 w-full overflow-y-auto my-4 pr-2 custom-scrollbar text-text-main text-base">
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-muted">
            <RefreshCw className="animate-spin mr-2" size={20} />
            {t('loading')}...
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted opacity-50 py-12">
            <Clock size={48} className="mb-4" />
            <p className="text-xl">{t('historyEmpty')}</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className={`sticky top-0 z-10 shadow-sm transition-all duration-300 ${
              hasBgImage ? 'bg-panel/40 backdrop-blur-md' : 'bg-panel'
            }`}>
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-text-muted border-b border-border-main w-48">{t('history_time')}</th>
                <th className="px-6 py-4 text-sm font-semibold text-text-muted border-b border-border-main w-40">{t('history_type')}</th>
                <th className="px-6 py-4 text-sm font-semibold text-text-muted border-b border-border-main w-1/3">{t('history_input')}</th>
                <th className="px-6 py-4 text-sm font-semibold text-text-muted border-b border-border-main w-1/3">{t('history_output')}</th>
                <th className="px-6 py-4 text-sm font-semibold text-text-muted border-b border-border-main text-right w-32">{t('history_action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-main">
              {filteredHistory.map((item) => (
                <tr key={item.id} className="hover:bg-app/50 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-text-muted font-medium">
                    {formatTime(item.timestamp)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {getIconForType(item.type)}
                      <span className="text-sm font-medium text-text-main">{getTypeLabel(item.type)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-text-main line-clamp-2" title={item.input}>{item.input}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-text-main line-clamp-2 font-medium" title={item.output}>{item.output}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopy(item.output)}
                        className="p-2 text-text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                        title={t('copy_result')}
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        onClick={() => onReuse(item)}
                        className="p-2 text-text-muted hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                        title={t('reuse')}
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
