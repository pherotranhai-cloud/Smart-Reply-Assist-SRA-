import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
  isDataLoaded: boolean;
  onComplete: () => void;
  t: (key: string) => string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ isDataLoaded, onComplete, t }) => {
  const [minTimePassed, setMinTimePassed] = useState(false);

  // Khống chế thời gian tối thiểu 3.0s để phô diễn trọn vẹn animation
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimePassed(true);
    }, 3000);
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
  // Khung vòm vàng (Yellow Arch): 
  // Đi từ góc dưới trái -> dưới phải -> lên vai phải -> thụt vào -> vẽ vòm hoàn hảo -> thụt ra trái -> đóng lại.
  const yellowArchPath = "M 15 160 L 185 160 L 185 110 L 168 110 A 68 68 0 0 0 32 110 L 15 110 Z";
  
  // Chữ L xanh: Căn chỉnh tỷ lệ cân bằng bên trái
  const letterLPath = "M 55 80 V 140 H 90 V 120 H 75 V 80 Z";
  
  // Chữ Y xanh: Căn chỉnh tỷ lệ cân bằng bên phải
  const letterYPath = "M 105 80 L 125 110 V 140 H 145 V 110 L 165 80 H 145 L 135 98 L 125 80 Z";

  const colorYellow = "#FBBF24"; // Vàng hoàng kim chuẩn
  const colorGreen = "#16A34A";  // Xanh lá đậm chuyên nghiệp

  // ==========================================
  // CẤU HÌNH HIỆU ỨNG CHUYỂN ĐỘNG
  // ==========================================
  const svgVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2 }
    }
  };

  const pathVariants = {
    hidden: { 
      pathLength: 0, 
      fillOpacity: 0, 
      strokeOpacity: 0 
    },
    visible: {
      pathLength: 1,
      fillOpacity: 1,
      strokeOpacity: [0, 1, 1, 0], // Nét vẽ sáng lên, sau đó chìm đi nhường chỗ cho fill
      transition: {
        pathLength: { duration: 1.2, ease: "easeInOut" },
        fillOpacity: { duration: 0.8, ease: "easeOut", delay: 1.0 },
        strokeOpacity: { duration: 1.8, times: [0, 0.2, 0.7, 1] }
      }
    }
  };

  const textVariants = {
    hidden: { opacity: 0, y: 15, filter: "blur(4px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.8, delay: 1.8, ease: "easeOut" }
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
        // Phông nền Slate cực tối, sang trọng và không bị rác mắt
        className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden bg-[#0B0F19]"
      >
        {/* Khối trung tâm với nhịp thở siêu nhẹ nhàng */}
        <motion.div 
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
          className="relative flex flex-col items-center"
        >
          {/* Logo SVG */}
          <motion.div
            initial={{ filter: "drop-shadow(0px 0px 0px rgba(0,0,0,0))" }}
            animate={{ filter: `drop-shadow(0px 8px 25px rgba(0,0,0,0.5))` }} // Bóng đen tạo khối nổi 3D mượt
            transition={{ delay: 1.2, duration: 1.0 }}
            className="w-[180px] md:w-[240px]"
          >
            <motion.svg 
              viewBox="0 0 200 200" 
              className="w-full h-full"
              variants={svgVariants}
              initial="hidden"
              animate="visible"
            >
              {/* Khung vòm vàng */}
              <motion.path
                d={yellowArchPath}
                stroke={colorYellow}
                strokeWidth="2.5"
                fill={colorYellow}
                variants={pathVariants}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Chữ L */}
              <motion.path
                d={letterLPath}
                stroke={colorGreen}
                strokeWidth="2"
                fill={colorGreen}
                variants={pathVariants}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Chữ Y */}
              <motion.path
                d={letterYPath}
                stroke={colorGreen}
                strokeWidth="2"
                fill={colorGreen}
                variants={pathVariants}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          </motion.div>

          {/* Dòng chữ thương hiệu chuẩn Enterprise */}
          <motion.h1
            variants={textVariants}
            initial="hidden"
            animate="visible"
            className="mt-8 text-xl md:text-2xl font-semibold text-white uppercase tracking-[0.4em] font-sans"
            style={{ marginRight: '-0.4em' }} // Cân bằng lại khoảng cách do tracking
          >
            LAI YIH GROUP
          </motion.h1>
        </motion.div>

        {/* Thông điệp mờ ảo ở Footer */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ delay: 2.2, duration: 1 }}
          className="absolute bottom-12 text-[10px] md:text-xs text-slate-400 tracking-[0.3em] uppercase font-medium"
        >
          {t ? t('manufacturingExcellence') : 'MANUFACTURING EXCELLENCE'}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
