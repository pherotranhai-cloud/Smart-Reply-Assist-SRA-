import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Languages, PenTool, BookOpen, Settings, CheckCircle2, AlertCircle, X, MessagesSquare } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  toast: { message: string; type: 'info' | 'error' | 'success' } | null;
  onCloseToast: () => void;
  t: (key: string) => string;
}

export const Layout: React.FC<LayoutProps> = ({ 
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
          {/* Edge Blurs for Horizontal Swipe (Mobile Only) */}
          <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-panel/90 to-transparent pointer-events-none z-10 sm:hidden rounded-l-2xl" />
          <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-panel/90 to-transparent pointer-events-none z-10 sm:hidden rounded-r-2xl" />
          
          <div 
            className="bg-panel border border-border-main rounded-2xl flex items-center overflow-x-auto snap-x snap-mandatory no-scrollbar sm:justify-center px-4 sm:px-2 py-2 gap-2 sm:gap-4"
          >
            <NavItem 
              icon={<Languages size={24} />} 
              label={t('translate')}
              active={activeTab === 'translate'} 
              onClick={(e) => handleTabClick('translate', e)} 
            />
            <NavItem 
              icon={<MessagesSquare size={24} />} 
              label="Talk"
              active={activeTab === 'talk'} 
              onClick={(e) => handleTabClick('talk', e)} 
            />
            <NavItem 
              icon={<PenTool size={24} />} 
              label={t('compose')}
              active={activeTab === 'compose'} 
              onClick={(e) => handleTabClick('compose', e)} 
            />
            <NavItem 
              icon={<BookOpen size={24} />} 
              label={t('vocab')}
              active={activeTab === 'vocab'} 
              onClick={(e) => handleTabClick('vocab', e)} 
            />
            <NavItem 
              icon={<Settings size={24} />} 
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
    className={`relative flex items-center justify-center w-16 h-16 shrink-0 snap-center rounded-2xl transition-all duration-300 ${
      active ? 'text-[#006D77] scale-110' : 'text-slate-400 hover:text-slate-500 dark:text-slate-500 dark:hover:text-slate-400'
    }`}
  >
    {/* Subtle active background glow */}
    <div className={`absolute inset-1 bg-[#006D77]/5 dark:bg-[#006D77]/20 rounded-xl transition-opacity duration-300 ${
      active ? 'opacity-100' : 'opacity-0'
    }`} />
    
    <div className="relative z-10 flex flex-col items-center">
      {icon}
    </div>

    {/* Top Dot Indicator */}
    {active && (
      <motion.div
        layoutId="activeTabIndicator"
        className="absolute top-1.5 w-1.5 h-1.5 rounded-full bg-[#006D77]"
        initial={false}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    )}
  </button>
);
