import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceVisualizerProps {
  isListening: boolean;
  onClick: () => void;
  title?: string;
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({ isListening, onClick, title }) => {
  const [intensity, setIntensity] = useState<number[]>([0.2, 0.4, 0.3, 0.5, 0.2]);

  // Simulate audio intensity when listening
  useEffect(() => {
    if (!isListening) return;
    
    const interval = setInterval(() => {
      setIntensity(Array.from({ length: 5 }, () => 0.2 + Math.random() * 0.8));
    }, 150);

    return () => clearInterval(interval);
  }, [isListening]);

  return (
    <div className="relative flex items-center justify-center">
      {isListening && (
        <>
          {/* Expanding Rings */}
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute rounded-full bg-red-500/20"
              initial={{ width: 40, height: 40, opacity: 0.8 }}
              animate={{ width: 80, height: 80, opacity: 0 }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.5,
                ease: "easeOut"
              }}
            />
          ))}
        </>
      )}

      <button
        onClick={onClick}
        className={`relative z-10 flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 ${
          isListening 
            ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' 
            : 'bg-panel border border-border-main text-text-muted hover:text-accent hover:border-accent/30'
        }`}
        title={title}
      >
        {isListening ? <MicOff size={18} /> : <Mic size={18} />}
      </button>

      {/* Audio Bars (Simulated) */}
      {isListening && (
        <div className="absolute -top-6 flex items-end gap-1 h-4">
          {intensity.map((val, idx) => (
            <motion.div
              key={idx}
              className="w-1 bg-red-500 rounded-full"
              animate={{ height: `${val * 100}%` }}
              transition={{ duration: 0.15 }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
