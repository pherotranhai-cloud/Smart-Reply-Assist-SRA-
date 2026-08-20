import React from 'react';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import { LayoutMobile } from './LayoutMobile';
import { LayoutDesktop } from './LayoutDesktop';
import { UserPreferences } from '../types';

interface LayoutDispatcherProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  toast: { message: string; type: 'info' | 'error' | 'success' } | null;
  onCloseToast: () => void;
  t: (key: string) => string;
  userPreferences?: UserPreferences;
}

export const Layout: React.FC<LayoutDispatcherProps> = (props) => {
  const { isDesktop } = useDeviceDetect();

  // App owns preferences via useUserPreferences and always passes them down.
  // Layout previously mirrored them into local state and, if the prop were
  // missing, loaded them from storage under a different key than the hook
  // writes - so that path could only ever have returned defaults.
  const activePrefs = props.userPreferences;

  // Determine custom font family class
  const fontClass = activePrefs?.fontFamily === 'mono' ? 'font-custom-mono'
    : activePrefs?.fontFamily === 'serif' ? 'font-custom-serif'
    : activePrefs?.fontFamily === 'playfair' ? 'font-custom-fancy'
    : 'font-custom-sans';

  // Determine custom font size class
  const sizeClass = activePrefs?.fontSize === 'sm' ? 'text-sm'
    : activePrefs?.fontSize === 'lg' ? 'text-lg'
    : activePrefs?.fontSize === 'xl' ? 'text-xl'
    : 'text-base';

  const layoutProps = {
    ...props,
    userPreferences: activePrefs,
  };

  return (
    <div 
      className={`min-h-screen w-full relative transition-all duration-300 ${fontClass} ${sizeClass}`}
    >
      {isDesktop ? (
        <LayoutDesktop {...layoutProps} />
      ) : (
        <LayoutMobile {...layoutProps} />
      )}
    </div>
  );
};
