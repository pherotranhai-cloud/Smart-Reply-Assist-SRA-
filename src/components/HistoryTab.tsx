import React from 'react';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import { HistoryTabMobile } from './HistoryTabMobile';
import { HistoryTabDesktop } from './HistoryTabDesktop';

export const HistoryTab: React.FC<any> = (props) => {
  const { isDesktop } = useDeviceDetect();
  return isDesktop ? <HistoryTabDesktop {...props} /> : <HistoryTabMobile {...props} />;
};
