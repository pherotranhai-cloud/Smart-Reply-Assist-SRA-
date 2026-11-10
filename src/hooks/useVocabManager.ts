import { useState, useEffect, useMemo } from 'react';
import { storage } from '../services/storage';
import { VocabItem } from '../types';
import Papa from 'papaparse';
import { useTextToSpeech } from './useTextToSpeech';

/**
 * `appVocab` is App's copy of the vocabulary, which the start-up cloud sync
 * replaces once it finishes. The Vocab tab stays mounted after its first
 * visit, so reading storage only on mount left it showing "0 terms" for good
 * whenever it was opened before that sync completed; re-reading whenever
 * App's copy changes keeps the list and the "last synced" time current.
 */
export function useVocabManager(appVocab?: VocabItem[]) {
  const [vocab, setVocab] = useState<VocabItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const { speak } = useTextToSpeech();

  const speakText = (text: string, langCode: string) => {
    speak(text, langCode);
  };

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
  }, [appVocab]);

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

  return {
    vocab,
    search,
    setSearch,
    loading,
    lastSynced,
    filteredVocab,
    handleExport,
    speakText,
  };
}
