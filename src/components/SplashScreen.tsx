import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface SplashScreenProps {
  isDataLoaded: boolean;
  onComplete: () => void;
  t: (key: string) => string; // Hoặc kiểu tương ứng với hàm i18n của bạn
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ isDataLoaded, onComplete, t }) => {
  const [minTimePassed, setMinTimePassed] = useState(false);

  // Đảm bảo hoạt ảnh chạy tối thiểu 3.2 giây để phô diễn hết 5 Frame
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimePassed(true);
    }, 3200);
    return () => clearTimeout(timer);
  }, []);

  // Chuyển trang mượt mà khi cả Animation và Data đều sẵn sàng
  useEffect(() => {
    if (minTimePassed && isDataLoaded) {
      onComplete();
    }
  }, [minTimePassed, isDataLoaded, onComplete]);

  // SVG Paths chuẩn của logo Lai Yih
  const yellowBorderPath = "M20,185 V135 H35 A85,85 0 0,1 205,135 H220 V185 H20 Z M32,173 H208 V140 H195 A73,73 0 0,0 45,140 H32 V173 Z";
  const greenLPath = "M75,95 H92 V135 H115 V150 H75 V95 Z";
  const greenYPath = "M125,95 H143 L152,118 L161,95 H179 L162,130 V150 H143 V130 L125,95 Z";

  // VARIANTS: Cấu hình diễn hoạt Logo (Frame 2 & Frame 3)
  const pathVariants = {
    hidden: { 
      pathLength: 0, 
      fillOpacity: 0, 
      strokeOpacity: 0 
    },
    visible: (custom: number) => ({
      pathLength: 1,
      strokeOpacity: [0, 1, 1, 0.2], // Vẽ nét sáng rực, sau đó chìm nhẹ khi fill xuất hiện
      fillOpacity: 1,
      transition: {
        pathLength: { duration: 1.5, ease: "easeInOut", delay: custom },
        strokeOpacity: { duration: 2, times: [0, 0.2, 0.7, 1], delay: custom },
        fillOpacity: { duration: 0.8, ease: "easeIn", delay: custom + 1.2 }
      }
    })
  };

  // VARIANTS: Cấu hình Container cho chữ (Frame 4)
  const textContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08, // Hiệu ứng xuất hiện nối tiếp nhau
        delayChildren: 2.2     // Bắt đầu chạy sau khi logo tô màu xong
      }
    }
  };

  // VARIANTS: Cấu hình từng ký tự của chữ
  const letterVariants = {
    hidden: { opacity: 0, y: 15, filter: "blur(8px)" },
    visible: { 
      opacity: 1, 
      y: 0, 
      filter: "blur(0px)",
      transition: { duration: 0.5, ease: "easeOut" }
    }
  };

  const brandName = "LAI YIH GROUP";

  return (
    <AnimatePresence>
      <motion.div
        key="splash-screen"
        // Frame 1: Khởi tạo màu nền & Frame 5: Hiệu ứng Thoát (Exit)
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ 
          opacity: 0, 
          scale: 1.05, 
          filter: "blur(15px)", 
          transition: { duration: 0.8, ease: "easeInOut" } 
        }}
        className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden bg-[#020617] bg-[radial-gradient(circle_at_center,rgba(0,109,119,0.35)_0%,rgba(2,6,23,1)_75%)]"
      >
        {/* Frame 5: Khối Float Animation lơ lửng cho toàn bộ cụm trung tâm */}
        <motion.div 
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
          className="relative flex flex-col items-center"
        >
          {/* Logo SVG Container */}
          <motion.div
            initial={{ filter: "drop-shadow(0px 0px 0px rgba(0,0,0,0))" }}
            animate={{ filter: "drop-shadow(0px 0px 35px rgba(34,197,94,0.35))" }}
            transition={{ delay: 1.8, duration: 1.2 }}
            className="relative z-10 w-[220px] md:w-[300px]"
          >
            <svg viewBox="0 0 240 240" className="w-full h-full drop-shadow-xl">
              <motion.path
                d={yellowBorderPath}
                stroke="#FACC15"
                strokeWidth="2"
                fill="#FACC15"
                custom={0}
                variants={pathVariants}
                initial="hidden"
                animate="visible"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <motion.path
                d={greenLPath}
                stroke="#22C55E"
                strokeWidth="2"
                fill="#22C55E"
                custom={0.2}
                variants={pathVariants}
                initial="hidden"
                animate="visible"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <motion.path
                d={greenYPath}
                stroke="#22C55E"
                strokeWidth="2"
                fill="#22C55E"
                custom={0.4}
                variants={pathVariants}
                initial="hidden"
                animate="visible"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {/* Tia chớp kim loại quét ngang logo (Metal Shimmer Sweep) */}
            <motion.div
              initial={{ left: '-100%', opacity: 0 }}
              animate={{ left: '100%', opacity: [0, 0.5, 0] }}
              transition={{ duration: 1.2, delay: 2.5, ease: "easeInOut" }}
              className="absolute inset-0 z-20 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-[-25deg] pointer-events-none mix-blend-overlay"
            />
          </motion.div>

          {/* Text Container: "LAI YIH GROUP" */}
          <motion.h1
            variants={textContainerVariants}
            initial="hidden"
            animate="visible"
            className="mt-10 flex space-x-2 text-2xl md:text-3xl font-black text-white uppercase font-sans tracking-[0.3em] drop-shadow-[0_2px_15px_rgba(255,255,255,0.2)]"
          >
            {brandName.split('').map((char, index) => (
              <motion.span
                key={index}
                variants={letterVariants}
                className={char === ' ' ? 'w-4' : ''}
              >
                {char}
              </motion.span>
            ))}
          </motion.h1>
        </motion.div>

        {/* Thông điệp mờ ảo phía dưới chân màn hình (Tùy chọn hiển thị) */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 0.5, y: 0 }}
          transition={{ delay: 2.8, duration: 1 }}
          className="absolute bottom-10 text-[10px] text-slate-400 tracking-[0.4em] uppercase font-medium"
        >
          {t ? t('manufacturingExcellence') : 'MANUFACTURING EXCELLENCE'}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
