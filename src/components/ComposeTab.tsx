import React from 'react';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import { ComposeTabMobile } from './ComposeTabMobile';
import { ComposeTabDesktop } from './ComposeTabDesktop';

export const ComposeTab: React.FC<any> = (props) => {
  const { isDesktop } = useDeviceDetect();
  return isDesktop ? <ComposeTabDesktop {...props} /> : <ComposeTabMobile {...props} />;
};
