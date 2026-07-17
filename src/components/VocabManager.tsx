import React from 'react';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import { VocabManagerMobile } from './VocabManagerMobile';
import { VocabManagerDesktop } from './VocabManagerDesktop';

export const VocabManager: React.FC<any> = (props) => {
  const { isDesktop } = useDeviceDetect();
  return isDesktop ? <VocabManagerDesktop {...props} /> : <VocabManagerMobile {...props} />;
};
