import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Download, 
  BookOpen,
  CloudDownload
} from 'lucide-react';
import { VocabItem } from '../types';
import { storage } from '../services/storage';
import { VocabSkeleton } from './Skeleton';
import Papa from 'papaparse';

interface VocabManagerProps {
  onSave: (vocab: VocabItem[]) => void;
  t: (key: any) => string;
}

export const VocabManager: React.FC<VocabManagerProps> = ({ onSave, t }) => {
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const loadVocab = async () => {
      setLoading(true);
      try {
        const local = await storage.getVocab();
        setVocab(local);
      } catch (err) {
        console.error('Failed to load vocab from storage:', err);
      } finally {
        setLoading(false);
      }
    };
    loadVocab();
  }, []);

  const handleCloudSync = async () => {
    const adminKey = prompt('Please enter the Admin Secret Key to sync from Google Sheets:');
    if (!adminKey) return;

    setSyncing(true);
    try {
      const result = await storage.syncWithCloud(adminKey);
      if (result.success) {
        const local = await storage.getVocab();
        setVocab(local);
        onSave(local);
        alert(`Success: ${result.message}`);
      } else {
        alert(`Failed: ${result.message}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

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
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={handleCloudSync} 
            disabled={syncing}
            className="saas-button primary-button flex items-center justify-center gap-2"
          >
            <CloudDownload size={16} />
            <span>{syncing ? 'Syncing...' : 'Cloud Sync'}</span>
          </button>
          <button onClick={handleExport} className="saas-button secondary-button flex items-center justify-center gap-2">
            <Download size={16} />
            <span>{t('export')}</span>
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
        <input 
          type="text"
          placeholder={t('searchVocab')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="saas-input pl-10 w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border-slate-200 dark:border-slate-700"
        />
      </div>

      <div className="flex-1 overflow-auto min-h-[300px] border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
        {loading ? (
          <div className="p-4"><VocabSkeleton /></div>
        ) : filteredVocab.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500 gap-4">
            <BookOpen size={48} strokeWidth={1} />
            <p>No matching terms found</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 font-medium text-[12px] tracking-widest text-slate-500 uppercase w-1/3">VI</th>
                <th className="px-4 py-3 font-medium text-[12px] tracking-widest text-slate-500 uppercase w-1/3">EN</th>
                <th className="px-4 py-3 font-medium text-[12px] tracking-widest text-slate-500 uppercase w-1/3">ZH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredVocab.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{item.meaning_vi}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.target_en}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.target_zh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
