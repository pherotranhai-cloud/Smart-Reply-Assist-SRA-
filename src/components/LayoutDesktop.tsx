import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  Settings, 
  BookOpen, 
  History as HistoryIcon,
  Globe,
  PenTool,
  Mic,
  X
} from 'lucide-react';
import { AppState, UserPreferences } from '../types';
import { APP_VERSION } from '../config/version';

interface LayoutDesktopProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  toast?: { message: string; type: 'info' | 'error' | 'success' } | null;
  onCloseToast?: () => void;
  t: (key: string) => string;
  userPreferences?: UserPreferences;
}

export const LayoutDesktop: React.FC<LayoutDesktopProps> = ({
  children,
  activeTab,
  setActiveTab,
  toast,
  onCloseToast,
  t,
  userPreferences
}) => {
  const tabs = [
    { id: 'translate', icon: Globe, label: t('tabTranslate') || 'Dịch văn bản' },
    { id: 'talk', icon: Mic, label: t('tabTalk') || 'Dịch trực tiếp' },
    { id: 'compose', icon: PenTool, label: t('tabCompose') || 'Soạn thảo' },
    { id: 'history', icon: HistoryIcon, label: t('history') || 'Lịch sử' },
    { id: 'vocab', icon: BookOpen, label: t('vocab') || 'Sổ từ vựng' }
  ];

  const hasBgImage = !!userPreferences?.backgroundImage || (userPreferences?.backgroundEffect && userPreferences.backgroundEffect !== 'none');

  return (
    <div className={`flex flex-row h-screen w-screen overflow-hidden text-text-main transition-colors duration-500 ${
      hasBgImage ? 'bg-black/20' : 'bg-app'
    }`}>
      {/* Left Sidebar */}
      <div className={`w-20 h-full flex flex-col p-3 py-6 justify-between items-center flex-shrink-0 border-r border-border-main/50 transition-all duration-500 ${
        hasBgImage ? 'ios-glass bg-white/10 dark:bg-slate-900/40 backdrop-blur-xl' : 'bg-panel'
      }`}>
        <div className="flex flex-col items-center w-full gap-6">
          <nav className="flex flex-col gap-4 w-full items-center">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              
              const onClick = () => {
                setActiveTab(tab.id);
              };
              
              return (
                <button
                  key={tab.id}
                  onClick={onClick}
                  title={tab.label}
                  className={`flex items-center justify-center w-12 h-12 rounded-2xl transition-all ${
                    isSelected
                      ? 'bg-accent text-white shadow-md shadow-accent/20'
                      : 'text-text-muted hover:bg-app/50 hover:text-text-main'
                  }`}
                >
                  <Icon size={22} className={isSelected ? 'text-white' : ''} />
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-4 w-full items-center">
          <button
            onClick={() => setActiveTab('settings')}
            title={t('settings') || 'Cài đặt'}
            className={`flex items-center justify-center w-12 h-12 rounded-2xl transition-all ${
              activeTab === 'settings'
                ? 'bg-accent text-white shadow-md shadow-accent/20'
                : 'text-text-muted hover:bg-app/50 hover:text-text-main'
            }`}
          >
            <Settings size={22} className={activeTab === 'settings' ? 'text-white' : ''} />
          </button>
          <div className="text-[10px] text-text-muted opacity-60 font-medium">
            v{APP_VERSION}
          </div>
        </div>
      </div>

      {/* Main Content Canvas */}
      <div className={`flex-1 h-full overflow-hidden p-8 relative transition-all duration-500 ${
        hasBgImage ? 'bg-transparent' : 'bg-app'
      }`}>
        <div className={`h-full w-full max-w-[1400px] mx-auto rounded-3xl shadow-sm border overflow-hidden transition-all duration-500 ${
          hasBgImage ? 'ios-glass bg-white/10 dark:bg-slate-900/40 backdrop-blur-xl border-border-main/50' : 'bg-app border-border-main/40'
        }`}>
          {children}
        </div>
        
        {/* Toast handling for desktop if needed */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              className="absolute bottom-8 right-8 z-[9999]"
            >
              <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 text-white font-medium ${
                toast.type === 'error' ? 'bg-red-500' :
                toast.type === 'success' ? 'bg-green-500' :
                'bg-gray-800'
              }`}>
                {toast.message}
                {onCloseToast && (
                  <button onClick={onCloseToast} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                    <X size={16} />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
