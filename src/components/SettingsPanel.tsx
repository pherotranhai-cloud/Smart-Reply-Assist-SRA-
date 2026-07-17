import React from 'react';
import { useDeviceDetect } from '../hooks/useDeviceDetect';
import { SettingsPanelMobile } from './SettingsPanelMobile';
import { SettingsPanelDesktop } from './SettingsPanelDesktop';

export const SettingsPanel: React.FC<any> = (props) => {
  const { isDesktop } = useDeviceDetect();
  return isDesktop ? <SettingsPanelDesktop {...props} /> : <SettingsPanelMobile {...props} />;
};
