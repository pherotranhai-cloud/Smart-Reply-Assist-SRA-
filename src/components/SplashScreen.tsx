import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
  isDataLoaded: boolean;
  onComplete: () => void;
  t: (key: string) => string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ isDataLoaded, onComplete, t }) => {
  const [minTimePassed, setMinTimePassed] = useState(false);

  // 1. Đảm bảo animation chạy ít nhất 2.8s
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimePassed(true);
    }, 2800);
    return () => clearTimeout(timer);
  }, []);

  // 2. Chỉ chuyển trang khi cả Animation và Dữ liệu đều đã sẵn sàng
  useEffect(() => {
    if (minTimePassed && isDataLoaded) {
      onComplete();
    }
  }, [minTimePassed, isDataLoaded, onComplete]);

  // SVG Precision Paths (Tỉ lệ chuẩn cho Logo Lạc Tỷ)
  const yellowBorderPath = "M20,185 V135 H35 A85,85 0 0,1 205,135 H220 V185 H20 Z M32,173 H208 V140 H195 A73,73 0 0,0 45,140 H32 V173 Z";
  const greenLPath = "M75,95 H92 V135 H115 V150 H75 V95 Z";
  const greenYPath = "M125,95 H143 L152,118 L161,95 H179 L162,130 V150 H143 V130 L125,95 Z";

  const text = "LAI YIH GROUP";

  return (
    <motion.div
      initial={{ background: "linear-gradient(to bottom, #000000, #030712)" }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)", transition: { duration: 0.8 } }}
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Phông nền Vòng xoáy không gian vô cực (Vortex Space) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.svg 
          viewBox="0 0 800 800" 
          className="absolute w-[800px] h-[800px] opacity-40"
          animate={{ rotate: 360 }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        >
          <circle cx="400" cy="400" r="300" fill="none" stroke="#22C55E" strokeWidth="1" strokeDasharray="4, 12" />
          <circle cx="400" cy="400" r="200" fill="none" stroke="#FACC15" strokeWidth="1" strokeDasharray="4, 12" />
        </motion.svg>

        <motion.svg 
          viewBox="0 0 800 800" 
          className="absolute w-[1000px] h-[1000px] opacity-20"
          animate={{ rotate: -360 }}
          transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
        >
          <circle cx="400" cy="400" r="380" fill="none" stroke="#22C55E" strokeWidth="2" strokeDasharray="4, 12" />
          <circle cx="400" cy="400" r="280" fill="none" stroke="#FACC15" strokeWidth="2" strokeDasharray="4, 12" />
        </motion.svg>
      </div>

      <div className="relative flex flex-col items-center">
        {/* Logo Container - Liquid Reveal */}
        <motion.div 
          className="relative z-10"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg viewBox="0 0 240 240" className="w-[200px] md:w-[280px]">
            <motion.path
              d={yellowBorderPath}
              fill="#FACC15"
              initial={{ scaleY: 0, originY: 1 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 1.8, ease: "anticipate" }}
            />
            <motion.path
              d={greenLPath}
              fill="#22C55E"
              initial={{ scaleY: 0, originY: 1 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 1.8, delay: 0.2, ease: "anticipate" }}
            />
            <motion.path
              d={greenYPath}
              fill="#22C55E"
              initial={{ scaleY: 0, originY: 1 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 1.8, delay: 0.3, ease: "anticipate" }}
            />
          </svg>
        </motion.div>

        {/* Text Branding - Laser Scan Reveal */}
        <div className="relative mt-8 px-2 py-1 flex justify-center">
          <motion.div
            initial={{ top: 0, opacity: 0 }}
            animate={{ top: "100%", opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.2, delay: 1.6, ease: "linear" }}
            className="absolute left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-green-400 to-transparent z-20"
          />
          <motion.div
            initial={{ clipPath: "inset(0% 0% 100% 0%)" }}
            animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
            transition={{ duration: 1.2, delay: 1.6, ease: "linear" }}
            className="relative z-10 flex space-x-1.5"
          >
            {text.split('').map((char, index) => (
              <span
                key={index}
                className="text-white font-bold tracking-[0.25em] text-sm md:text-base opacity-90"
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Footer mờ ảo */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 2.5 }}
        className="absolute bottom-10 text-[10px] text-slate-400 tracking-widest uppercase"
      >
        {t('manufacturingExcellence')}
      </motion.div>
    </motion.div>
  );
};