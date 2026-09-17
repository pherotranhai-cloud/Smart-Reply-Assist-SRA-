import { useState, useEffect, useRef } from 'react';
import { storage } from '../services/storage';
import { CopyFormat, HistoryItem } from '../types';
import { copyFormattedText } from '../utils/clipboard';

type FilterType = 'all' | 'translate' | 'compose' | 'talk';

/**
 * The History tab stays mounted once it has been opened, so this list is no
 * longer re-read by a remount on the way back. Two things bring it up to date
 * instead: `isActive`, which re-reads storage every time the tab comes back to
 * the front and so picks up whatever Translate, Compose and Talk wrote while it
 * was away, and `refreshKey`, which Settings -> Clear History bumps while the
 * tab is hidden.
 */
export function useHistoryTab(
  t: (key: string) => string,
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
  refreshKey: number = 0,
  /** Settings → Copy Format; the row copy renders the same way the tabs do. */
  copyFormat: CopyFormat = 'plain',
  /** Whether History is the tab on screen. */
  isActive: boolean = true
) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (!isActive) return;
    // Only the very first read shows the spinner. On the way back the tab
    // already has last time's rows on screen, and blanking them for the length
    // of a storage read is exactly what keeping it mounted is meant to avoid.
    loadHistory(hasLoaded.current);
    hasLoaded.current = true;
  }, [refreshKey, isActive]);

  const loadHistory = async (silent: boolean = false) => {
    if (!silent) setLoading(true);
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
