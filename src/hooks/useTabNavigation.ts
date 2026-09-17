import { createContext, useContext, useState, useCallback, useMemo } from 'react';

export type TabType = 'translate' | 'compose' | 'talk' | 'vocab' | 'history' | 'settings';

/**
 * Whether the tab a component is rendered inside is the one on screen.
 *
 * A tab that is not showing is `display: none`, which hides everything it
 * renders - except what it renders through a portal, because that lands in
 * <body> and knows nothing about the tab it came from. The Settings header and
 * Compose's action bar both portal a `position: fixed` element out on purpose
 * (a transformed ancestor would otherwise become its containing block during a
 * swipe), and both used to disappear with the tab because the tab unmounted.
 * Now that a tab stays mounted, anything portalled out of one has to read this
 * and render nothing while its tab is away.
 *
 * The default is `true`, so a component used outside a tab is unaffected.
 */
const TabActiveContext = createContext(true);
export const TabActiveProvider = TabActiveContext.Provider;
export const useTabActive = () => useContext(TabActiveContext);

// Left-to-right order of the mobile bottom nav. Swipe navigation walks this
// list, so it has to stay in sync with the NavItem order in LayoutMobile.
export const TAB_ORDER: readonly TabType[] = [
  'translate',
  'talk',
  'compose',
  'vocab',
  'history',
  'settings',
];

// Clamped, not cyclic: the two ends are walls, so a swipe there rubber-bands
// instead of jumping across the whole nav. `null` means "nowhere to go".
export function getAdjacentTab(tab: TabType, delta: 1 | -1): TabType | null {
  const index = TAB_ORDER.indexOf(tab);
  if (index === -1) return null;
  const next = index + delta;
  if (next < 0 || next >= TAB_ORDER.length) return null;
  return TAB_ORDER[next];
}

export function useTabNavigation(defaultTab: TabType = 'translate') {
  const [activeTab, setActiveTabState] = useState<TabType>(defaultTab);

  const changeTab = useCallback((tab: TabType) => {
    setActiveTabState(tab);
  }, []);

  const tabIndex = useMemo(() => {
    const index = TAB_ORDER.indexOf(activeTab);
    return index === -1 ? 0 : index;
  }, [activeTab]);

  const step = useCallback((delta: 1 | -1) => {
    setActiveTabState(prev => getAdjacentTab(prev, delta) ?? prev);
  }, []);

  const goToNextTab = useCallback(() => step(1), [step]);
  const goToPrevTab = useCallback(() => step(-1), [step]);

  return {
    activeTab,
    setActiveTab: changeTab,
    tabIndex,
    goToNextTab,
    goToPrevTab,
  };
}
