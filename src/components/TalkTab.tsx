import React from 'react';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import { TalkTabMobile } from './TalkTabMobile';
import { TalkTabDesktop } from './TalkTabDesktop';

export const TalkTab: React.FC<any> = (props) => {
  const { isDesktop } = useDeviceDetect();
  return isDesktop ? <TalkTabDesktop {...props} /> : <TalkTabMobile {...props} />;
};
