import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Download, 
  BookOpen,
  Clock,
  Volume2
} from 'lucide-react';
import { VocabItem } from '../types';
import { storage } from '../services/storage';
import { VocabSkeleton } from './Skeleton';
import Papa from 'papaparse';
import { useTextToSpeech } from '../hooks/useTextToSpeech';

interface VocabManagerProps {
  t: (key: any) => string;
}

const VocabCell = ({ label, text, lang, speak }: { label: string, text: string, lang: string, speak: (text: string, lang: string) => void }) => {
  if (!text) return null;
  return (
    <div className="flex flex-col p-3 rounded-lg bg-white dark:bg-panel shadow-sm border border-border-main hover:border-[#006D77] transition-colors relative group">
      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest mb-1">{label}</span>
      <span className="text-text-main font-bold pr-6">{text}</span>
      <button 
        onClick={() => speak(text, lang)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-[#006D77] opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-[#006D77]/10"
        title={`Listen in ${label}`}
      >
        <Volume2 size={16} />
      </button>
    </div>
  );
};

export const VocabManager: React.FC<VocabManagerProps> = ({ t }) => {
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  
  const { speak } = useTextToSpeech();

  useEffect(() => {
    const loadVocab = async () => {
      setLoading(true);
      try {
        const [local, syncTime] = await Promise.all([
          storage.getVocab(),
          storage.getLastSyncTime()
        ]);
        setVocab(local);
        if (syncTime) {
          const date = new Date(syncTime);
          setLastSynced(date.toLocaleString());
        }
      } catch (err) {
        console.error('Failed to load vocab from storage:', err);
      } finally {
        setLoading(false);
      }
    };
    loadVocab();
  }, []);

  const filteredVocab = useMemo(() => {
    return vocab.filter(v => {
      const searchTerm = search.toLowerCase();
      return (
        v.vi?.toLowerCase().includes(searchTerm) ||
        v.en?.toLowerCase().includes(searchTerm) ||
        v.zh_cn?.toLowerCase().includes(searchTerm) ||
        v.zh_tw?.toLowerCase().includes(searchTerm) ||
        v.id_lang?.toLowerCase().includes(searchTerm) ||
        v.my?.toLowerCase().includes(searchTerm) ||
        v.term?.toLowerCase().includes(searchTerm)
      );
    });
  }, [vocab, search]);

  const handleExport = () => {
    const csv = Papa.unparse(vocab);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `vocab_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full gap-4 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BookOpen className="text-accent" />
          {t('vocabularyManager')}
        </h2>
        <div className="flex gap-2 w-full sm:w-auto items-center">
          {lastSynced && (
            <span className="text-xs text-text-muted flex items-center gap-1 mr-2">
              <Clock size={12} /> {lastSynced}
            </span>
          )}
          <button onClick={handleExport} className="saas-button secondary-button flex items-center justify-center gap-2">
            <Download size={16} />
            <span>{t('export')}</span>
          </button>
        </div>
      </div>

      {!search.trim() ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 px-4">
          <div className="w-full max-w-2xl relative group">
            <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
              <Search size={24} className="text-gray-400 group-focus-within:text-[#006D77] transition-colors" />
            </div>
            <input
              type="text"
              className="w-full pl-14 pr-6 py-5 text-lg bg-panel border border-border-main shadow-sm rounded-2xl focus:border-[#006D77] focus:ring-2 focus:ring-[#006D77] transition-all text-text-main placeholder-gray-400 outline-none"
              placeholder="Tìm từ vựng chuyên ngành (VI/EN/ZH/ID/MY)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="mt-6 text-sm text-text-muted flex items-center gap-2">
            <BookOpen size={16} />
            Start typing to search across {vocab.length} terms in 6 languages.
          </p>
        </div>
      ) : (
        <div className="flex flex-col h-full gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text"
              placeholder="Tìm từ vựng chuyên ngành (VI/EN/ZH/ID/MY)..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-panel border border-[#006D77]/30 rounded-xl focus:border-[#006D77] focus:ring-2 focus:ring-[#006D77] transition-all text-text-main placeholder-gray-400 outline-none"
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-auto min-h-[300px]">
            {loading ? (
              <div className="p-4"><VocabSkeleton /></div>
            ) : filteredVocab.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-4">
                <Search size={48} strokeWidth={1} className="text-slate-300" />
                <p>No matching terms found for "<span className="font-semibold text-[#006D77]">{search}</span>"</p>
              </div>
            ) : (
              <div className="space-y-4 pb-12">
                {filteredVocab.map((item, index) => (
                  <div key={`${item.id}-${index}`} className="flex flex-col bg-surface rounded-xl shadow-sm border border-border-main p-4 gap-3 transition-colors hover:border-[#006D77]/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <VocabCell label="VI" text={item.vi || ''} lang="vi" speak={speak} />
                      <VocabCell label="EN" text={item.en || ''} lang="en" speak={speak} />
                      <VocabCell label="ZH-CN" text={item.zh_cn || ''} lang="zh-CN" speak={speak} />
                      <VocabCell label="ZH-TW" text={item.zh_tw || ''} lang="zh-TW" speak={speak} />
                      <VocabCell label="ID" text={item.id_lang || ''} lang="id" speak={speak} />
                      <VocabCell label="MY" text={item.my || ''} lang="my" speak={speak} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
