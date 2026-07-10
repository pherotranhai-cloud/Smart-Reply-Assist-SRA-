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
  const borderPath = "M90 1510 L90 850 L250 850 A850 850 0 0 1 1750 850 L1910 850 L1910 1510 Z";

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
          <svg viewBox="0 -50 2000 1650" className="w-[220px] md:w-[300px] drop-shadow-[0_0_40px_rgba(34,197,94,0.3)]">
            <motion.path
              d={borderPath}
              stroke="#F7B500"
              strokeWidth="70"
              fill="none"
              strokeLinecap="square"
              strokeLinejoin="miter"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.8, ease: "easeInOut" }}
            />
            <motion.text
              x="1000"
              y="1100"
              textAnchor="middle"
              fill="#2FA05E"
              fontFamily="Arial, Helvetica, sans-serif"
              fontWeight="700"
              fontSize="780px"
              letterSpacing="-20px"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.2, delay: 0.8, ease: "easeOut" }}
            >
              LY
            </motion.text>
          </svg>
        </motion.div>

        {/* Text Branding */}
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.8, ease: "easeOut" }}
          className="mt-8 text-2xl font-bold text-white uppercase tracking-[0.3em] font-sans text-center drop-shadow-[0_2px_10px_rgba(255,255,255,0.1)]"
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