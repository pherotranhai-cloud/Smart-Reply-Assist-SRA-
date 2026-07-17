import { useState, useEffect } from 'react';
import { storage } from '../services/storage';
import { HistoryItem } from '../types';
import { copyTextToClipboard } from '../utils/clipboard';

type FilterType = 'all' | 'translate' | 'compose' | 'talk';

export function useHistoryTab(t: (key: string) => string, showToast: (msg: string, type: 'success' | 'error' | 'info') => void) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await storage.getHistory();
      setHistory(data);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    const success = await copyTextToClipboard(text);
    if (success) {
      showToast(t('copied') || 'Copied to clipboard', 'success');
    } else {
      showToast('Failed to copy', 'error');
    }
  };

  const filteredHistory = history.filter(item => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  return {
    history,
    filter,
    setFilter,
    loading,
    filteredHistory,
    handleCopy,
  };
}
