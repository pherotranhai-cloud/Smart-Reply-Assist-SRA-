import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Plus, 
  Trash2, 
  Upload, 
  Download, 
  Loader2, 
  AlertCircle, 
  CheckCircle2,
  BookOpen
} from 'lucide-react';
import { VocabItem } from '../types';
import { storage } from '../services/storage';
import { VocabSkeleton } from './Skeleton';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface VocabManagerProps {
  onSave: (vocab: VocabItem[]) => void;
  t: (key: any) => string;
}

export const VocabManager: React.FC<VocabManagerProps> = ({ onSave, t }) => {
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const loadVocab = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/vocab');
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            setVocab(data);
            storage.setVocab(data);
          }
        } else {
          const local = await storage.getVocab();
          setVocab(local);
        }
      } catch (err) {
        const local = await storage.getVocab();
        setVocab(local);
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

  const handleToggle = async (id: string | number) => {
    const newVocab = vocab.map(v => 
      v.id === id ? { ...v, enabled: String(v.enabled).toLowerCase() === 'true' ? 'false' : 'true' } : v
    );
    setVocab(newVocab);
    onSave(newVocab);
    await storage.setVocab(newVocab);
  };

  const handleDelete = async (id: string | number) => {
    const newVocab = vocab.filter(v => v.id !== id);
    setVocab(newVocab);
    onSave(newVocab);
    await storage.setVocab(newVocab);
  };

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

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        let results: any[] = [];

        if (file.name.endsWith('.csv')) {
          const parsed = Papa.parse(data as string, { header: true });
          results = parsed.data;
        } else {
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          results = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        }

        const newItems: VocabItem[] = results.map((r: any, idx) => {
          const meaning_vi = r.meaning_vi || r.Vietnamese || '';
          const target_en = r.target_en || r.English || '';
          const target_zh = r.target_zh || r.Chinese || '';
          return {
            id: String(Date.now() + idx),
            term: meaning_vi || target_en || target_zh,
            meaning_vi,
            target_en,
            target_zh,
            enabled: 'true'
          };
        }).filter(item => item.term);

        const updatedVocab = [...vocab, ...newItems];
        setVocab(updatedVocab);
        onSave(updatedVocab);
        await storage.setVocab(updatedVocab);
        
        // Try to sync with backend
        fetch('/api/import-vocab', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItems)
        }).catch(err => console.error('Backend sync failed:', err));

      } catch (err) {
        console.error('Import failed:', err);
      } finally {
        setImporting(false);
      }
    };

    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BookOpen className="text-accent" />
          {t('vocabularyManager')}
        </h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <label className="flex-1 sm:flex-none">
            <div className="saas-button secondary-button flex items-center justify-center gap-2 cursor-pointer">
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              <span>{t('import')}</span>
            </div>
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleImport} disabled={importing} />
          </label>
          <button onClick={handleExport} className="saas-button secondary-button flex items-center justify-center gap-2">
            <Download size={16} />
            <span>{t('export')}</span>
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={18} />
        <input 
          type="text"
          placeholder={t('searchVocab')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="saas-input pl-10 w-full"
        />
      </div>

      <div className="flex-1 overflow-auto min-h-[300px]">
        {loading ? (
          <VocabSkeleton />
        ) : filteredVocab.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-white/30 gap-4">
            <BookOpen size={48} strokeWidth={1} />
            <p>{t('noVocabFound')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredVocab.map((item) => (
              <div key={item.id} className="premium-card p-4 flex items-center justify-between gap-4 group">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] uppercase text-white/30 block">VI</span>
                    <span className="text-sm font-medium">{item.meaning_vi}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-white/30 block">EN</span>
                    <span className="text-sm font-medium">{item.target_en}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase text-white/30 block">ZH</span>
                    <span className="text-sm font-medium">{item.target_zh}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleToggle(item.id!)}
                    className={`w-10 h-6 rounded-full transition-colors relative ${String(item.enabled).toLowerCase() === 'true' ? 'bg-accent' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${String(item.enabled).toLowerCase() === 'true' ? 'left-5' : 'left-1'}`} />
                  </button>
                  <button 
                    onClick={() => handleDelete(item.id!)}
                    className="p-2 text-white/30 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
