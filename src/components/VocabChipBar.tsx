import React from 'react';
import { motion } from 'motion/react';
import { VocabItem } from '../types';

interface VocabChipBarProps {
  vocab: VocabItem[];
  onSelect: (item: VocabItem) => void;
  targetLang: string;
}

export const VocabChipBar: React.FC<VocabChipBarProps> = ({ vocab, onSelect, targetLang }) => {
  if (!vocab || vocab.length === 0) return null;

  // Filter only enabled items and those that have a translation for the target language
  const activeVocab = vocab.filter(item => String(item.enabled).toLowerCase() === 'true');

  return (
    <div className="w-full overflow-x-auto no-scrollbar py-2 px-1 flex gap-2 items-center">
      {activeVocab.map((item, idx) => {
        const displayValue = targetLang.toLowerCase().includes('vi') ? item.meaning_vi : 
                           targetLang.toLowerCase().includes('zh') ? item.target_zh : 
                           item.target_en;
        
        if (!displayValue) return null;

        return (
          <motion.button
            key={item.id || idx}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelect(item)}
            className="whitespace-nowrap px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all shadow-sm"
          >
            {displayValue}
          </motion.button>
        );
      })}
    </div>
  );
};
