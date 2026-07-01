import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useAnimation, useMotionValue } from 'motion/react';
import { Bot, X, ChevronRight, Copy, Check, Loader2, Link as LinkIcon } from 'lucide-react';
import { AISettings, VocabItem } from '../types';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';

interface FloatingAssistantProps {
  settings: AISettings;
  vocab: VocabItem[];
}

export const FloatingAssistant: React.FC<FloatingAssistantProps> = ({ settings, vocab }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  const controls = useAnimation();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Initial position on mount
  }, []);

  const handleDragEnd = (event: any, info: any) => {
    if (!buttonRef.current) return;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const centerX = buttonRect.left + buttonRect.width / 2;
    const centerY = buttonRect.top + buttonRect.height / 2;
    
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const distLeft = centerX;
    const distRight = windowWidth - centerX;
    const distTop = centerY;
    const distBottom = windowHeight - centerY;

    let newX = x.get();
    let newY = y.get();

    if (distLeft < distRight) {
      newX -= (distLeft - 16);
    } else {
      newX += (distRight - 16);
    }
    
    if (distTop < 16) newY -= (distTop - 16);
    if (distBottom < 16) newY += (distBottom - 16);

    controls.start({
      x: newX,
      y: newY,
      transition: { type: 'spring', stiffness: 300, damping: 25 }
    });
  };

  const handleSearch = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setResult('');
    setAnnotations([]);
    
    try {
      const res = await fetch('/api/expert-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: input })
      });

      if (!res.ok) {
        throw new Error('Search failed');
      }

      const data = await res.json();
      setResult(data.reply);
      setAnnotations(data.annotations || []);
    } catch (err) {
      console.error(err);
      setResult('Lỗi kết nối hoặc vượt quá giới hạn. Vui lòng thử lại.');
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

  const urlCitations = annotations.filter(a => a.type === 'url_citation' && a.url_citation);

  return (
    <>
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
              <Bot size={22} className="fill-accent/20" />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>

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
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-main bg-bg-input/50">
                <div className="flex items-center gap-2 text-text-main font-semibold text-sm">
                  <Bot size={16} className="text-accent fill-accent/20" />
                  <span>Chuyên gia Kỹ thuật</span>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-full hover:bg-border-main/50 text-text-muted transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 flex flex-col gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Hỏi về keo, xử lý bề mặt, lỗi kỹ thuật..."
                  className="w-full h-20 resize-none bg-input text-text-main text-[15px] p-3 rounded-2xl border border-border-main focus:border-accent focus:ring-1 focus:ring-accent transition-all outline-none"
                />

                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleSearch}
                    disabled={!input.trim() || loading}
                    className="shrink-0 p-2.5 rounded-full bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                  >
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <ChevronRight size={18} />}
                  </button>
                </div>

                <AnimatePresence>
                  {result && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-2 pt-3 border-t border-border-main relative"
                    >
                      <button
                        onClick={handleCopy}
                        className="absolute top-2 right-0 p-1.5 text-text-muted hover:text-text-main bg-panel rounded-lg shadow-sm border border-border-main transition-colors z-10"
                      >
                        {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                      </button>
                      <div className="text-[15px] text-text-main leading-loose pr-8 max-h-[40vh] overflow-y-auto markdown-body">
                        <Markdown 
                          remarkPlugins={[remarkMath, remarkGfm]} 
                          rehypePlugins={[rehypeKatex]}
                          components={{
                            table: ({node, ...props}) => (
                              <div className="overflow-x-auto my-4 rounded-xl border border-slate-200 dark:border-slate-800">
                                <table className="w-full text-left border-collapse" {...props} />
                              </div>
                            ),
                            th: ({node, ...props}) => (
                              <th className="bg-slate-50 dark:bg-slate-800/50 p-3 text-[13px] font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-800 tracking-wide" {...props} />
                            ),
                            td: ({node, ...props}) => (
                              <td className="p-3 text-[13px] border-b border-slate-100 dark:border-slate-800/50 text-slate-600 dark:text-slate-300" {...props} />
                            )
                          }}
                        >
                          {result}
                        </Markdown>
                        
                        {urlCitations.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-border-main/50">
                            <p className="text-[11px] font-medium text-text-muted mb-2 uppercase tracking-wider flex items-center gap-1.5">
                              <span>📌</span> Nguồn tài liệu tham khảo:
                            </p>
                            <div className="flex flex-col gap-1.5">
                              {urlCitations.map((citation: any, idx: number) => (
                                <a
                                  key={idx}
                                  href={citation.url_citation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2 rounded-lg bg-panel hover:bg-border-main/30 border border-border-main transition-colors group"
                                >
                                  <div className="w-5 h-5 rounded-md bg-bg-input flex items-center justify-center shrink-0">
                                    <LinkIcon size={10} className="text-text-muted group-hover:text-accent transition-colors" />
                                  </div>
                                  <span className="text-[11px] font-medium text-text-main truncate">
                                    {citation.url_citation.title || citation.url_citation.url}
                                  </span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
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
