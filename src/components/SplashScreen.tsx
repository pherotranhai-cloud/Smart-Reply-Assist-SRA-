import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SplashScreenProps {
  isDataLoaded: boolean;
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ isDataLoaded, onComplete }) => {
  const [minTimePassed, setMinTimePassed] = useState(false);

  // 1. Đảm bảo animation chạy ít nhất 3.5s để người dùng thấy hết độ "ngầu"
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimePassed(true);
    }, 3500);
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

  // Các biến thể Animation (Variants)
  const borderVariants = {
    hidden: { pathLength: 0, fillOpacity: 0 },
    visible: { 
      pathLength: 1, 
      fillOpacity: 1,
      transition: { 
        pathLength: { duration: 1.5, ease: "easeInOut" },
        fillOpacity: { duration: 0.8, delay: 1.5, ease: "easeOut" }
      }
    }
  };

  const letterPathVariants = {
    hidden: { pathLength: 0, fillOpacity: 0 },
    visible: { 
      pathLength: 1, 
      fillOpacity: 1,
      transition: { 
        pathLength: { duration: 0.8, delay: 1.8, ease: "easeInOut" },
        fillOpacity: { duration: 0.8, delay: 2.6, ease: "easeOut" }
      }
    }
  };

  const textContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { delayChildren: 2.8, staggerChildren: 0.05 }
    }
  };

  const letterVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  const ambientGlowVariants = {
    animate: {
      opacity: [0.2, 0.5, 0.2],
      scale: [0.9, 1.1, 0.9],
      transition: { duration: 3, repeat: Infinity, ease: "easeInOut" }
    }
  };

  const text = "LAI YIH GROUP";

  return (
    <motion.div
      initial={{ backgroundColor: "#000000" }}
      animate={{ backgroundColor: "#020617" }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)", transition: { duration: 0.8 } }}
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Vầng sáng Ambient (Tiếp tục "thở" nếu App load chậm) */}
      <motion.div
        variants={ambientGlowVariants}
        animate="animate"
        className="absolute w-[400px] h-[400px] bg-green-500/10 rounded-full blur-[100px] pointer-events-none"
      />

      <div className="relative flex flex-col items-center">
        {/* Logo Container */}
        <motion.div 
          className="relative z-10"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg viewBox="0 0 240 240" className="w-[200px] md:w-[280px]">
            <motion.path
              d={yellowBorderPath}
              stroke="#FACC15"
              strokeWidth="1"
              fill="#FACC15"
              variants={borderVariants}
              initial="hidden"
              animate="visible"
            />
            <motion.path
              d={greenLPath}
              stroke="#22C55E"
              strokeWidth="1"
              fill="#22C55E"
              variants={letterPathVariants}
              initial="hidden"
              animate="visible"
            />
            <motion.path
              d={greenYPath}
              stroke="#22C55E"
              strokeWidth="1"
              fill="#22C55E"
              variants={letterPathVariants}
              initial="hidden"
              animate="visible"
            />
          </svg>

          {/* Hiệu ứng Ánh Kim (Shimmer) chạy ngang sau khi vẽ xong */}
          <motion.div
            initial={{ left: '-100%', opacity: 0 }}
            animate={{ left: '100%', opacity: [0, 0.6, 0] }}
            transition={{ duration: 1.2, delay: 3.2, ease: "easeInOut" }}
            className="absolute inset-0 z-20 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-25deg] pointer-events-none"
          />
        </motion.div>

        {/* Text Branding */}
        <motion.div 
          variants={textContainerVariants}
          initial="hidden"
          animate="visible"
          className="mt-10 flex space-x-1.5 relative z-10"
        >
          {text.split('').map((char, index) => (
            <motion.span
              key={index}
              variants={letterVariants}
              className="text-white font-bold tracking-[0.25em] text-sm md:text-base opacity-80"
            >
              {char === ' ' ? '\u00A0' : char}
            </motion.span>
          ))}
        </motion.div>
      </div>

      {/* Footer mờ ảo */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ delay: 3.5 }}
        className="absolute bottom-10 text-[10px] text-slate-400 tracking-widest uppercase"
      >
        Manufacturing Excellence
      </motion.div>
    </motion.div>
  );
};