import { useState, useEffect } from 'react';
import { storage } from '../services/storage';
import { CopyFormat, HistoryItem } from '../types';
import { copyFormattedText } from '../utils/clipboard';

type FilterType = 'all' | 'translate' | 'compose' | 'talk';

/**
 * `refreshKey` re-reads storage when it changes. Today the History tab unmounts
 * whenever another tab is showing, so a Settings -> Clear History round trip
 * already comes back to a fresh read; the key is what keeps that true if the
 * tab is ever kept mounted, since clearing storage cannot reach this state.
 */
export function useHistoryTab(
  t: (key: string) => string,
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
  refreshKey: number = 0,
  /** Settings → Copy Format; the row copy renders the same way the tabs do. */
  copyFormat: CopyFormat = 'plain'
) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [refreshKey]);

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
    const success = await copyFormattedText(text, copyFormat ?? 'plain');
    if (success) {
      showToast(t('copied'), 'success');
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
