import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Languages, PenTool, BookOpen, Settings, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  isLoading: boolean;
  toast: { message: string; type: 'info' | 'error' | 'success' } | null;
  onCloseToast: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab, 
  isLoading, 
  toast, 
  onCloseToast 
}) => {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background text-text-main">
      {/* Splash Screen */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-background"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-6"
            >
              <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/40 animate-pulse-soft">
                <Languages size={40} className="text-white" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">SRA</h1>
                <p className="text-muted text-sm font-medium uppercase tracking-[0.2em]">Smart Reply Assist</p>
              </div>
            </motion.div>
            
            <div className="absolute bottom-12 w-48 h-1 bg-muted/10 rounded-full overflow-hidden">
              <motion.div 
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="w-full h-full bg-primary"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <motion.main 
        initial={{ opacity: 0 }}
        animate={{ opacity: showSplash ? 0 : 1 }}
        className="flex-1 flex flex-col pb-20 max-w-2xl mx-auto w-full px-4 pt-6"
      >
        {children}
      </motion.main>

      {/* Bottom Navigation */}
      {!showSplash && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2">
          <div className="max-w-md mx-auto glass-panel flex items-center justify-around py-1 px-2 shadow-2xl">
            <NavItem 
              icon={<Languages size={20} />} 
              label="Translate" 
              active={activeTab === 'translate'} 
              onClick={() => setActiveTab('translate')} 
            />
            <NavItem 
              icon={<PenTool size={20} />} 
              label="Compose" 
              active={activeTab === 'compose'} 
              onClick={() => setActiveTab('compose')} 
            />
            <NavItem 
              icon={<BookOpen size={20} />} 
              label="Vocab" 
              active={activeTab === 'vocab'} 
              onClick={() => setActiveTab('vocab')} 
            />
            <NavItem 
              icon={<Settings size={20} />} 
              label="Settings" 
              active={activeTab === 'settings'} 
              onClick={() => setActiveTab('settings')} 
            />
          </div>
        </nav>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-24 left-4 right-4 z-[100] flex justify-center pointer-events-none"
          >
            <div className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border backdrop-blur-xl min-w-[280px] ${
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
    <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
  </button>
);
