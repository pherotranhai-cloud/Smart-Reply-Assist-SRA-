import React from 'react';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import { TranslateTabMobile } from './TranslateTabMobile';
import { TranslateTabDesktop } from './TranslateTabDesktop';

export const TranslateTab: React.FC<any> = (props) => {
  const { isDesktop } = useDeviceDetect();
  return isDesktop ? <TranslateTabDesktop {...props} /> : <TranslateTabMobile {...props} />;
};
