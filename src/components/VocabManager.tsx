import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Download, 
  BookOpen,
  Clock
} from 'lucide-react';
import { VocabItem } from '../types';
import { storage } from '../services/storage';
import { VocabSkeleton } from './Skeleton';
import Papa from 'papaparse';

interface VocabManagerProps {
  t: (key: any) => string;
}

export const VocabManager: React.FC<VocabManagerProps> = ({ t }) => {
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

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

  const filteredVocab = vocab.filter(v => 
    v.meaning_vi?.toLowerCase().includes(search.toLowerCase()) ||
    v.target_en?.toLowerCase().includes(search.toLowerCase()) ||
    v.target_zh?.toLowerCase().includes(search.toLowerCase())
  );

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
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BookOpen className="text-accent" />
          {t('vocabularyManager')}
        </h2>
        <div className="flex gap-2 w-full sm:w-auto items-center">
          {lastSynced && (
            <span className="text-xs text-text-muted flex items-center gap-1 mr-2">
              <Clock size={12} /> Last synced: {lastSynced}
            </span>
          )}
          <button onClick={handleExport} className="saas-button secondary-button flex items-center justify-center gap-2">
            <Download size={16} />
            <span>{t('export')}</span>
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
        <input 
          type="text"
          placeholder={t('searchVocab')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="saas-input pl-10"
        />
      </div>

      <div className="flex-1 overflow-auto min-h-[300px] border border-border-main rounded-xl bg-panel">
        {loading ? (
          <div className="p-4"><VocabSkeleton /></div>
        ) : filteredVocab.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted gap-4">
            <BookOpen size={48} strokeWidth={1} />
            <p>No matching terms found</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-panel border-b border-border-main">
              <tr>
                <th className="px-4 py-3 font-medium text-[12px] tracking-widest text-text-muted uppercase w-1/3">VI</th>
                <th className="px-4 py-3 font-medium text-[12px] tracking-widest text-text-muted uppercase w-1/3">EN</th>
                <th className="px-4 py-3 font-medium text-[12px] tracking-widest text-text-muted uppercase w-1/3">ZH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-main/50">
              {filteredVocab.map((item, index) => (
                <tr key={`${item.id}-${index}`} className="hover:bg-border-main/20 transition-colors">
                  <td className="px-4 py-3 text-text-main">{item.meaning_vi}</td>
                  <td className="px-4 py-3 text-text-muted">{item.target_en}</td>
                  <td className="px-4 py-3 text-text-muted">{item.target_zh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
