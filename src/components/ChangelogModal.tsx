import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles, CheckCircle2 } from 'lucide-react';
import { UPDATE_CHANGELOG } from '../config/version';

/**
 * Renders the **bold** markers used in UPDATE_CHANGELOG.features. The list was
 * previously printed as raw text, so readers saw literal asterisks.
 */
const renderEmphasis = (text: string) =>
  text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
  );

export const ChangelogModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-panel border border-border-main rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent to-blue-500" />
            
            <div className="p-5 border-b border-border-main bg-bg-input">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                    <Sparkles size={18} />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-accent">Mới Cập Nhật</span>
                </div>
                <button 
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-border-main/50 text-text-muted transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <h3 className="text-lg font-bold text-text-main mt-3 leading-tight">
                {UPDATE_CHANGELOG.title}
              </h3>
            </div>
            
            <div className="p-5">
              <ul className="space-y-4">
                {UPDATE_CHANGELOG.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-[15px] text-text-main leading-snug">{renderEmphasis(feature)}</span>
                  </li>
                ))}
              </ul>
              
              <button
                onClick={onClose}
                className="mt-6 w-full saas-button primary-button rounded-xl py-3 text-[15px] font-medium"
              >
                Trải nghiệm ngay
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
