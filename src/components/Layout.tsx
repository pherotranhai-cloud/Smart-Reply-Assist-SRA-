import React, { useEffect, useState } from 'react';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import { LayoutMobile } from './LayoutMobile';
import { LayoutDesktop } from './LayoutDesktop';
import { UserPreferences } from '../types';
import { storage } from '../services/storage';
import { BackgroundCanvas } from './BackgroundCanvas';

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
  const [localPrefs, setLocalPrefs] = useState<UserPreferences | null>(props.userPreferences || null);

  useEffect(() => {
    if (props.userPreferences) {
      setLocalPrefs(props.userPreferences);
    } else {
      const loadPrefs = async () => {
        try {
          const loaded = await storage.getUserPreferences();
          if (loaded) {
            setLocalPrefs(loaded);
          }
        } catch (err) {
          console.error("Layout failed to load preferences:", err);
        }
      };
      loadPrefs();
    }
  }, [props.userPreferences]);

  const activePrefs = localPrefs || props.userPreferences;

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

  // Dynamic style for container element
  const layoutStyle: React.CSSProperties = activePrefs?.backgroundImage ? {
    backgroundImage: `url(${activePrefs.backgroundImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  } : {};

  const layoutProps = {
    ...props,
    userPreferences: activePrefs,
  };

  return (
    <div 
      className={`min-h-screen w-full relative transition-all duration-300 ${fontClass} ${sizeClass}`}
      style={layoutStyle}
    >
      {/* Background canvas wrapper running under all controls, z-[-1] or similar */}
      {activePrefs && <BackgroundCanvas preferences={activePrefs} />}
      
      {isDesktop ? (
        <LayoutDesktop {...layoutProps} />
      ) : (
        <LayoutMobile {...layoutProps} />
      )}
    </div>
  );
};
