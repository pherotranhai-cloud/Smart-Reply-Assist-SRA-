import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Languages, PenTool, BookOpen, Settings, CheckCircle2, AlertCircle, X, MessagesSquare, History, Mic } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  toast: { message: string; type: 'info' | 'error' | 'success' } | null;
  onCloseToast: () => void;
  t: (key: string) => string;
}

export const LayoutMobile: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab, 
  toast, 
  onCloseToast,
  t
}) => {

  const handleTabClick = (tab: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }
    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    setActiveTab(tab);
  };

  return (
    <div className="flex flex-col min-h-screen bg-app text-text-main">
      {/* Main Content */}
      <motion.main 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex-1 flex flex-col pb-20 max-w-2xl mx-auto w-full px-4 pt-6"
      >
        {children}
      </motion.main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-6 pt-2 bg-gradient-to-t from-app via-app/80 to-transparent pointer-events-none">
        <div className="pointer-events-auto relative w-full max-w-md mx-4 drop-shadow-sm">
          <div 
            className="ios-glass rounded-[24px] flex items-center justify-around w-full px-2 py-2 md:px-6 gap-1 md:gap-3 overflow-hidden"
          >
            <NavItem 
              icon={<Languages className="w-5 h-5 md:w-6 md:h-6" />} 
              label={t('translate')}
              active={activeTab === 'translate'} 
              onClick={(e) => handleTabClick('translate', e)} 
            />
            <NavItem 
              icon={<Mic className="w-5 h-5 md:w-6 md:h-6" />} 
              label={t('live_translate') || 'Live Translate'}
              active={activeTab === 'talk'} 
              onClick={(e) => handleTabClick('talk', e)} 
            />
            <NavItem 
              icon={<PenTool className="w-5 h-5 md:w-6 md:h-6" />} 
              label={t('compose')}
              active={activeTab === 'compose'} 
              onClick={(e) => handleTabClick('compose', e)} 
            />
            <NavItem 
              icon={<BookOpen className="w-5 h-5 md:w-6 md:h-6" />} 
              label={t('vocab')}
              active={activeTab === 'vocab'} 
              onClick={(e) => handleTabClick('vocab', e)} 
            />
            <NavItem 
              icon={<History className="w-5 h-5 md:w-6 md:h-6" />} 
              label={t('history') || 'History'}
              active={activeTab === 'history'} 
              onClick={(e) => handleTabClick('history', e)} 
            />
            <NavItem 
              icon={<Settings className="w-5 h-5 md:w-6 md:h-6" />} 
              label={t('settings')}
              active={activeTab === 'settings'} 
              onClick={(e) => handleTabClick('settings', e)} 
            />
          </div>
        </div>
      </nav>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-24 left-4 right-4 z-[100] flex justify-center pointer-events-none"
          >
            <div className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-sm flex items-center gap-3 border backdrop-blur-xl min-w-[280px] ${
              toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 
              toast.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' :
              'bg-[#006D77]/10 border-[#006D77]/20 text-[#006D77]'
            }`}>
              {toast.type === 'success' ? <CheckCircle2 size={18} /> : 
               toast.type === 'error' ? <AlertCircle size={18} /> : null}
              <span className="text-sm font-medium flex-1">{toast.message}</span>
              <button onClick={onCloseToast} className="p-1 hover:bg-black/5 rounded-full transition-colors">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) => (
  <button 
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`relative flex items-center justify-center flex-1 max-w-[48px] h-12 md:max-w-none md:w-16 md:h-16 shrink-0 rounded-2xl transition-all duration-300 ${
      active ? 'text-[#006D77] scale-110' : 'text-slate-400 hover:text-slate-500 dark:text-slate-500 dark:hover:text-slate-400'
    }`}
  >
    {/* Subtle active background glow */}
    <div className={`absolute inset-0.5 md:inset-1 bg-[#006D77]/5 dark:bg-[#006D77]/20 rounded-xl transition-opacity duration-300 ${
      active ? 'opacity-100' : 'opacity-0'
    }`} />
    
    <div className="relative z-10 flex flex-col items-center">
      {icon}
    </div>

    {/* Top Dot Indicator */}
    {active && (
      <motion.div
        layoutId="activeTabIndicator"
        className="absolute top-1 md:top-1.5 w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-[#006D77]"
        initial={false}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    )}
  </button>
);
