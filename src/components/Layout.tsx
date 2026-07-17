import React from 'react';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import { LayoutMobile } from './LayoutMobile';
import { LayoutDesktop } from './LayoutDesktop';

interface LayoutDispatcherProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  toast: { message: string; type: 'info' | 'error' | 'success' } | null;
  onCloseToast: () => void;
  t: (key: string) => string;
}

export const Layout: React.FC<LayoutDispatcherProps> = (props) => {
  const { isDesktop } = useDeviceDetect();
  return isDesktop ? <LayoutDesktop {...props} /> : <LayoutMobile {...props} />;
};
