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
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)", transition: { duration: 0.8 } }}
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden bg-[#020617] bg-[radial-gradient(circle_at_center,rgba(0,109,119,0.35)_0%,rgba(2,6,23,1)_75%)]"
    >
      <div className="relative flex flex-col items-center">
        {/* Logo Container - Liquid Reveal */}
        <motion.div 
          className="relative z-10"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg viewBox="0 0 240 240" className="w-[220px] md:w-[300px] drop-shadow-[0_0_40px_rgba(34,197,94,0.3)]">
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

        {/* Text Branding */}
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.8, ease: "easeOut" }}
          className="mt-12 text-2xl md:text-3xl font-black text-white tracking-[0.35em] uppercase font-sans text-center drop-shadow-[0_2px_10px_rgba(255,255,255,0.1)]"
        >
          LAI YIH GROUP
        </motion.h1>
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