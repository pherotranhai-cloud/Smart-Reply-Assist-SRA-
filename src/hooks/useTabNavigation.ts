import { useState, useCallback } from 'react';

export type TabType = 'translate' | 'compose' | 'talk' | 'vocab' | 'history' | 'settings';

export function useTabNavigation(defaultTab: TabType = 'translate') {
  const [activeTab, setActiveTabState] = useState<TabType>(defaultTab);

  const changeTab = useCallback((tab: TabType) => {
    setActiveTabState(tab);
  }, []);

  return {
    activeTab,
    setActiveTab: changeTab,
  };
}
