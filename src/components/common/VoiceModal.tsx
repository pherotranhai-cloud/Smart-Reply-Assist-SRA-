import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic } from 'lucide-react';

interface VoiceModalProps {
  isOpen: boolean;
  textListening: string;
  onRelease: () => void;
}

export const VoiceModal: React.FC<VoiceModalProps> = ({ isOpen, textListening, onRelease }) => {
  const [intensity, setIntensity] = useState<number[]>([0.2, 0.4, 0.3, 0.5, 0.2]);

  useEffect(() => {
    if (!isOpen) return;
    
    const interval = setInterval(() => {
      setIntensity(Array.from({ length: 5 }, () => 0.2 + Math.random() * 0.8));
    }, 150);

    return () => clearInterval(interval);
  }, [isOpen]);

  // Handle global mouse up / touch end in case they release outside
  useEffect(() => {
    if (!isOpen) return;

    const handleRelease = () => {
      onRelease();
    };

    window.addEventListener('mouseup', handleRelease);
    window.addEventListener('touchend', handleRelease);

    return () => {
      window.removeEventListener('mouseup', handleRelease);
      window.removeEventListener('touchend', handleRelease);
    };
  }, [isOpen, onRelease]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-md"
          onMouseUp={onRelease}
          onTouchEnd={onRelease}
        >
          <div className="relative flex flex-col items-center justify-center pointer-events-none">
            {/* Expanding Rings */}
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full bg-red-500/30"
                initial={{ width: 80, height: 80, opacity: 0.8 }}
                animate={{ width: 200, height: 200, opacity: 0 }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.5,
                  ease: "easeOut"
                }}
              />
            ))}

            {/* Center Mic Circle */}
            <div className="relative z-10 flex items-center justify-center w-24 h-24 bg-red-500 rounded-full shadow-2xl shadow-red-500/50">
              <Mic size={40} className="text-white" />
              
              {/* Audio Bars */}
              <div className="absolute -bottom-8 flex items-end gap-1.5 h-6">
                {intensity.map((val, idx) => (
                  <motion.div
                    key={idx}
                    className="w-1.5 bg-red-500 rounded-full"
                    animate={{ height: `${val * 100}%` }}
                    transition={{ duration: 0.15 }}
                  />
                ))}
              </div>
            </div>

            {/* Status Text */}
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute -bottom-24 text-white font-medium text-lg tracking-wide whitespace-nowrap"
            >
              {textListening}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
