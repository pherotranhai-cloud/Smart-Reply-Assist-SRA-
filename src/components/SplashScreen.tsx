import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
  isDataLoaded: boolean;
  onComplete: () => void;
  t: (key: string) => string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ isDataLoaded, onComplete, t }) => {
  const [minTimePassed, setMinTimePassed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimePassed(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (minTimePassed && isDataLoaded) onComplete();
  }, [minTimePassed, isDataLoaded, onComplete]);

  // SVG Paths chuẩn từ tệp thiết kế của bạn
  const borderPath = "M 90 1510 L 90 850 L 250 850 A 850 850 0 0 1 1750 850 L 1910 850 L 1910 1510 Z";
  
  return (
    <AnimatePresence>
      <motion.div
        key="splash-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.6 } }}
        className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-[#0B0F19]"
      >
        <motion.div 
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="relative flex flex-col items-center"
        >
          {/* Logo SVG mới chuẩn theo thiết kế của bạn */}
          <motion.div className="w-[200px] md:w-[250px] drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)]">
            <svg viewBox="0 0 2000 2000">
              {/* Nét vẽ khung vòm vàng */}
              <motion.path
                d={borderPath}
                stroke="#F7B500"
                strokeWidth="70"
                fill="none"
                strokeLinecap="square"
                strokeLinejoin="miter"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: "easeInOut" }}
              />
              {/* Chữ LY xanh lá */}
              <motion.text
                x="1000"
                y="1330"
                textAnchor="middle"
                fill="#2FA05E"
                className="font-black"
                style={{ fontSize: '760px', fontFamily: 'Arial, Helvetica, sans-serif' }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.2, duration: 0.8 }}
              >
                LY
              </motion.text>
            </svg>
          </motion.div>

          {/* Dòng chữ thương hiệu */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.8, duration: 0.8 }}
            className="mt-8 text-2xl font-bold text-white uppercase tracking-[0.3em] font-sans"
          >
            LAI YIH GROUP
          </motion.h1>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};