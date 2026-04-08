import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Languages, PenTool, BookOpen, Settings, CheckCircle2, AlertCircle, X } from 'lucide-react';

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
        <div className="pointer-events-auto w-full max-w-md backdrop-blur-lg bg-panel/80 border border-border-main rounded-2xl flex items-center justify-around py-2 px-2 shadow-sm mx-4">
            <NavItem 
              icon={<Languages size={20} />} 
              label={t('translate')} 
              active={activeTab === 'translate'} 
              onClick={() => setActiveTab('translate')} 
            />
            <NavItem 
              icon={<PenTool size={20} />} 
              label={t('compose')} 
              active={activeTab === 'compose'} 
              onClick={() => setActiveTab('compose')} 
            />
            <NavItem 
              icon={<BookOpen size={20} />} 
              label={t('vocab')} 
              active={activeTab === 'vocab'} 
              onClick={() => setActiveTab('vocab')} 
            />
            <NavItem 
              icon={<Settings size={20} />} 
              label={t('settings')} 
              active={activeTab === 'settings'} 
              onClick={() => setActiveTab('settings')} 
            />
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
              'bg-primary/10 border-primary/20 text-primary'
            }`}>
              {toast.type === 'success' ? <CheckCircle2 size={18} /> : 
               toast.type === 'error' ? <AlertCircle size={18} /> : null}
              <span className="text-sm font-medium flex-1">{toast.message}</span>
              <button onClick={onCloseToast} className="p-1 hover:bg-muted/10 rounded-full transition-colors">
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`bottom-nav-item ${active ? 'active' : ''}`}
  >
    <div className={`p-2 rounded-xl transition-all duration-300 ${active ? 'bg-primary/10 scale-110' : 'hover:bg-muted/5'}`}>
      {icon}
    </div>
    <span className="text-[11px] font-medium uppercase tracking-widest">{label}</span>
  </button>
);
