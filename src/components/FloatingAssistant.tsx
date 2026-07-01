import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useAnimation, useMotionValue } from 'motion/react';
import { Zap, X, ChevronRight, Copy, Check, Loader2 } from 'lucide-react';
import { AIService } from '../services/ai';
import { AISettings, Language, VocabItem } from '../types';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface FloatingAssistantProps {
  settings: AISettings;
  vocab: VocabItem[];
}

const QUICK_LANGS: Language[] = ['English', 'Vietnamese', 'Chinese (Simplified)', 'Chinese (Traditional)', 'Indonesian', 'Burmese'];
const LANG_LABELS: Record<string, string> = {
  'English': 'EN',
  'Vietnamese': 'VI',
  'Chinese (Simplified)': 'CN',
  'Chinese (Traditional)': 'TW',
  'Indonesian': 'ID',
  'Burmese': 'MY'
};

export const FloatingAssistant: React.FC<FloatingAssistantProps> = ({ settings, vocab }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [targetLang, setTargetLang] = useState<Language>('Vietnamese');
  const [isCopied, setIsCopied] = useState(false);
  
  const controls = useAnimation();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Initial position on mount - can be empty to let CSS handle it initially
    // We will let the CSS bottom/right position it initially, and x/y will be offsets.
  }, []);

  const handleDragEnd = (event: any, info: any) => {
    if (!buttonRef.current) return;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const centerX = buttonRect.left + buttonRect.width / 2;
    const centerY = buttonRect.top + buttonRect.height / 2;
    
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Calculate distance to all 4 edges
    const distLeft = centerX;
    const distRight = windowWidth - centerX;
    const distTop = centerY;
    const distBottom = windowHeight - centerY;

    // We want to snap to the nearest left/right edge, but keep the y position mostly intact, 
    // unless it's too close to top/bottom
    const minXDist = Math.min(distLeft, distRight);
    
    let newX = x.get();
    let newY = y.get();

    if (distLeft < distRight) {
      // Snap to left
      newX -= (distLeft - 16); // 16px padding
    } else {
      // Snap to right
      newX += (distRight - 16);
    }
    
    // Prevent going off top/bottom
    if (distTop < 16) newY -= (distTop - 16);
    if (distBottom < 16) newY += (distBottom - 16);

    controls.start({
      x: newX,
      y: newY,
      transition: { type: 'spring', stiffness: 300, damping: 25 }
    });
  };

  const handleTranslate = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setResult('');
    
    try {
      const ai = new AIService(settings);
      const res = await ai.translate(input, targetLang, vocab, undefined, false, (chunk) => {
        setResult(chunk);
      });
      setResult(res);
    } catch (err) {
      console.error(err);
      setResult('Lỗi dịch thuật. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <>
      {/* Draggable Button */}
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        animate={controls}
        style={{ x, y }}
        className={`fixed z-[9999] bottom-24 right-4 flex flex-col items-end ${isOpen ? 'pointer-events-none opacity-0' : ''}`}
      >
        <AnimatePresence>
          {!isOpen && (
            <motion.button
              ref={buttonRef}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              onClick={() => setIsOpen(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="pointer-events-auto w-12 h-12 rounded-full ios-glass bg-white/80 dark:bg-slate-800/80 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-border-main flex items-center justify-center text-accent backdrop-blur-xl"
            >
              <Zap size={22} className="fill-accent/20" />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Mini Overlay Panel */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[9999] pointer-events-none flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ y: '100%', opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: '100%', opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="pointer-events-auto w-full max-w-sm bg-card border border-border-main rounded-3xl shadow-2xl overflow-hidden flex flex-col ios-glass backdrop-blur-xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-main bg-bg-input/50">
                <div className="flex items-center gap-2 text-text-main font-semibold text-sm">
                  <Zap size={16} className="text-accent fill-accent/20" />
                  <span>Dịch nhanh</span>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-full hover:bg-border-main/50 text-text-muted transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 flex flex-col gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Nhập văn bản cần dịch..."
                  className="w-full h-24 resize-none bg-input text-text-main text-[15px] p-3 rounded-2xl border border-border-main focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none"
                />

                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {QUICK_LANGS.map(lang => (
                      <button
                        key={lang}
                        onClick={() => setTargetLang(lang)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          targetLang === lang 
                            ? 'bg-accent text-white' 
                            : 'bg-bg-input text-text-muted hover:bg-border-main/50'
                        }`}
                      >
                        {LANG_LABELS[lang]}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleTranslate}
                    disabled={!input.trim() || loading}
                    className="shrink-0 p-2.5 rounded-full bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <ChevronRight size={18} />}
                  </button>
                </div>

                {/* Result Area */}
                <AnimatePresence>
                  {result && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-2 pt-3 border-t border-border-main relative"
                    >
                      <button
                        onClick={handleCopy}
                        className="absolute top-2 right-0 p-1.5 text-text-muted hover:text-text-main bg-panel rounded-lg shadow-sm border border-border-main transition-colors"
                      >
                        {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                      <div className="text-[15px] text-text-main leading-loose pr-8 max-h-[40vh] overflow-y-auto markdown-body">
                        <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {result}
                        </Markdown>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
