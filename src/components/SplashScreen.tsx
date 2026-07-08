import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
  isDataLoaded: boolean;
  onComplete: () => void;
  t: (key: string) => string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ isDataLoaded, onComplete, t }) => {
  const [minTimePassed, setMinTimePassed] = useState(false);

  // Khống chế thời gian tối thiểu 3.2s để phô diễn trọn vẹn animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimePassed(true);
    }, 3200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (minTimePassed && isDataLoaded) {
      onComplete();
    }
  }, [minTimePassed, isDataLoaded, onComplete]);

  // ==========================================
  // TỌA ĐỘ SVG CHUẨN XÁC TỪ BẢN MẪU (200x200)
  // ==========================================
  
  // Khung vòm vàng: Chỉ dùng nét viền (stroke), không tô màu (fill)
  // Đi từ góc dưới trái -> dưới phải -> lên vai phải -> thụt vào -> vẽ vòm hoàn hảo -> thụt ra trái -> đóng lại.
  const yellowArchPath = "M 25 150 L 175 150 L 175 110 L 160 110 A 60 60 0 0 0 40 110 L 25 110 Z";
  
  // Chữ L xanh: Cân bằng bên trái
  const letterLPath = "M 55 85 V 135 H 85 V 118 H 73 V 85 Z";
  
  // Chữ Y xanh: Cân bằng bên phải
  const letterYPath = "M 112 85 L 128 110 V 135 H 146 V 110 L 162 85 H 146 L 137 100 L 128 85 Z";

  const colorYellow = "#FBBF24"; 
  const colorGreen = "#16A34A";  

  // ==========================================
  // CẤU HÌNH HIỆU ỨNG CHUYỂN ĐỘNG (ANIMATION)
  // ==========================================
  
  // Animation riêng cho khung vòm vàng (Chỉ vẽ viền, giữ nguyên viền)
  const archVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 1,
      opacity: 1,
      transition: { pathLength: { duration: 1.5, ease: "easeInOut" } }
    }
  };

  // Animation riêng cho chữ L và Y (Vẽ viền sau đó bơm màu)
  const letterVariants = {
    hidden: { pathLength: 0, fillOpacity: 0, strokeOpacity: 1 },
    visible: {
      pathLength: 1,
      fillOpacity: 1,
      strokeOpacity: [1, 1, 0], // Viền sáng lên rồi chìm đi nhường chỗ cho màu fill
      transition: {
        pathLength: { duration: 1.2, ease: "easeInOut", delay: 0.5 },
        fillOpacity: { duration: 0.8, ease: "easeOut", delay: 1.5 },
        strokeOpacity: { duration: 0.8, delay: 1.5 }
      }
    }
  };

  const textVariants = {
    hidden: { opacity: 0, y: 15, filter: "blur(4px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.8, delay: 2.0, ease: "easeOut" }
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="splash-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ 
          opacity: 0, 
          scale: 1.03, 
          filter: "blur(10px)", 
          transition: { duration: 0.6, ease: "easeInOut" } 
        }}
        className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden bg-[#0B0F19]"
      >
        <motion.div 
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
          className="relative flex flex-col items-center"
        >
          {/* Logo SVG */}
          <motion.div
            initial={{ filter: "drop-shadow(0px 0px 0px rgba(0,0,0,0))" }}
            animate={{ filter: `drop-shadow(0px 8px 25px rgba(0,0,0,0.4))` }}
            transition={{ delay: 1.2, duration: 1.0 }}
            className="w-[180px] md:w-[220px]"
          >
            <svg 
              viewBox="0 0 200 200" 
              className="w-full h-full"
            >
              {/* Khung vòm vàng - TUYỆT ĐỐI KHÔNG TÔ MÀU FILL */}
              <motion.path
                d={yellowArchPath}
                stroke={colorYellow}
                strokeWidth="12"
                fill="none" // <-- Đây là điểm vá lỗi quan trọng nhất
                strokeLinejoin="miter" // Tạo góc vuông sắc nét tại các bậc thang
                variants={archVariants}
                initial="hidden"
                animate="visible"
              />
              {/* Chữ L */}
              <motion.path
                d={letterLPath}
                stroke={colorGreen}
                strokeWidth="2"
                fill={colorGreen}
                strokeLinejoin="round"
                variants={letterVariants}
                initial="hidden"
                animate="visible"
              />
              {/* Chữ Y */}
              <motion.path
                d={letterYPath}
                stroke={colorGreen}
                strokeWidth="2"
                fill={colorGreen}
                strokeLinejoin="round"
                variants={letterVariants}
                initial="hidden"
                animate="visible"
              />
            </svg>
          </motion.div>

          {/* Dòng chữ thương hiệu */}
          <motion.h1
            variants={textVariants}
            initial="hidden"
            animate="visible"
            className="mt-8 text-xl md:text-2xl font-semibold text-white uppercase tracking-[0.4em] font-sans"
            style={{ marginRight: '-0.4em' }}
          >
            LAI YIH GROUP
          </motion.h1>
        </motion.div>

        {/* Footer */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ delay: 2.6, duration: 1 }}
          className="absolute bottom-12 text-[10px] md:text-xs text-slate-400 tracking-[0.3em] uppercase font-medium"
        >
          {t ? t('manufacturingExcellence') : 'MANUFACTURING EXCELLENCE'}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
