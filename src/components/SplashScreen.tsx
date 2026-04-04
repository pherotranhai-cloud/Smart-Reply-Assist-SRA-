import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface SplashScreenProps {
  isDataLoaded: boolean;
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ isDataLoaded, onComplete }) => {
  const [minTimePassed, setMinTimePassed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimePassed(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (minTimePassed && isDataLoaded) {
      onComplete();
    }
  }, [minTimePassed, isDataLoaded, onComplete]);

  // SVG Precision Paths (ViewBox 0 0 240 240)
  const yellowBorderPath = "M20,185 V135 H35 A85,85 0 0,1 205,135 H220 V185 H20 Z M32,173 H208 V140 H195 A73,73 0 0,0 45,140 H32 V173 Z";
  const greenLPath = "M75,95 H92 V135 H115 V150 H75 V95 Z";
  const greenYPath = "M125,95 H143 L152,118 L161,95 H179 L162,130 V150 H143 V130 L125,95 Z";

  const borderVariants: any = {
    hidden: { pathLength: 0, fillOpacity: 0, strokeOpacity: 1 },
    visible: { 
      pathLength: 1, 
      fillOpacity: 1,
      transition: { 
        pathLength: { duration: 1.5, ease: "easeInOut" },
        fillOpacity: { duration: 0.5, delay: 1.5, ease: "easeOut" }
      }
    }
  };

  const letterPathVariants: any = {
    hidden: { pathLength: 0, fillOpacity: 0, strokeOpacity: 1 },
    visible: { 
      pathLength: 1, 
      fillOpacity: 1,
      transition: { 
        pathLength: { duration: 0.8, delay: 1.8, ease: "easeInOut" },
        fillOpacity: { duration: 0.5, delay: 2.5, ease: "easeOut" }
      }
    }
  };

  const textContainerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 2.5,
        staggerChildren: 0.05
      }
    }
  };

  const letterVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  const text = "LAI YIH GROUP";

  return (
    <motion.div
      initial={{ backgroundColor: "#000000", opacity: 1 }}
      animate={{ backgroundColor: "#020617" }}
      exit={{ opacity: 0, scale: 1.2, transition: { duration: 0.6 } }}
      transition={{ duration: 1.5, ease: "easeInOut" }}
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Subtle radial gradient for depth */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(30,41,59,0.5)_0%,transparent_70%)] pointer-events-none" />

      {/* Shimmer effect container */}
      <motion.div 
        className="relative flex flex-col items-center"
        animate={{ scale: [1, 1.02, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg viewBox="0 0 240 240" className="relative z-10 w-[200px] md:w-[280px]">
          <motion.path
            d={yellowBorderPath}
            stroke="#FACC15"
            strokeWidth="2"
            fill="#FACC15"
            fillRule="nonzero"
            variants={borderVariants}
            initial="hidden"
            animate="visible"
          />
          <motion.path
            d={greenLPath}
            stroke="#22C55E"
            strokeWidth="2"
            fill="#22C55E"
            variants={letterPathVariants}
            initial="hidden"
            animate="visible"
          />
          <motion.path
            d={greenYPath}
            stroke="#22C55E"
            strokeWidth="2"
            fill="#22C55E"
            variants={letterPathVariants}
            initial="hidden"
            animate="visible"
          />
        </svg>

        {/* Shimmer Overlay */}
        <motion.div
          initial={{ left: '-100%', opacity: 0 }}
          animate={{ left: '100%', opacity: [0, 0.5, 0] }}
          transition={{ duration: 1, delay: 2, ease: "easeInOut" }}
          className="absolute top-0 bottom-0 z-20 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-[-20deg]"
          style={{ width: '100%' }}
        />
      </motion.div>

      <motion.div 
        variants={textContainerVariants}
        initial="hidden"
        animate="visible"
        className="mt-8 flex space-x-1 relative z-10"
      >
        {text.split('').map((char, index) => (
          <motion.span
            key={index}
            variants={letterVariants}
            className="text-white font-bold tracking-[0.2em] text-lg"
          >
            {char === ' ' ? '\u00A0' : char}
          </motion.span>
        ))}
      </motion.div>
    </motion.div>
  );
};
