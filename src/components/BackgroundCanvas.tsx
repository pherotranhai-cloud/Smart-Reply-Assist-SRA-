import React from 'react';
import { motion } from 'motion/react';
import { UserPreferences } from '../types';

interface BackgroundCanvasProps {
  preferences: UserPreferences;
}

export const BackgroundCanvas: React.FC<BackgroundCanvasProps> = ({ preferences }) => {
  if (!preferences) return null;

  const { backgroundImage, backgroundEffect } = preferences;

  return (
    <>
      {/* Absolute base layer: background image */}
      {backgroundImage && (
        <div 
          className="fixed inset-0 z-0 pointer-events-none transition-all duration-700 bg-cover bg-center ease-in-out"
          style={{ 
            backgroundImage: `url(${backgroundImage})`,
          }}
        />
      )}

      {/* Hardware-accelerated backdrops for background motion effects */}
      <div className="fixed inset-0 z-[1] pointer-events-none overflow-hidden">
        {backgroundEffect === 'liquid-glow' && (
          <div className="absolute inset-0 opacity-55 blur-[80px] transform-gpu pointer-events-none">
            <motion.div 
              animate={{ 
                x: [0, 180, -140, 0],
                y: [0, -180, 140, 0],
                scale: [1, 1.25, 0.9, 1]
              }}
              transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-1/4 left-1/4 w-[450px] h-[450px] rounded-full bg-pink-500/40 dark:bg-pink-500/30"
            />
            <motion.div 
              animate={{ 
                x: [0, -160, 180, 0],
                y: [0, 160, -180, 0],
                scale: [1, 0.85, 1.2, 1]
              }}
              transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
              className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-cyan-500/40 dark:bg-cyan-500/30"
            />
            <motion.div 
              animate={{ 
                x: [-100, 120, -80, -100],
                y: [100, -100, 120, 100],
                scale: [0.9, 1.15, 0.95, 0.9]
              }}
              transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-1/2 right-1/3 w-[400px] h-[400px] rounded-full bg-purple-500/40 dark:bg-purple-500/25"
            />
          </div>
        )}

        {backgroundEffect === 'particles' && (
          <div className="absolute inset-0 opacity-80 transform-gpu pointer-events-none">
            {[...Array(24)].map((_, i) => {
              const size = (i % 5) * 2.5 + 4; // 4px to 14px
              const left = (i * 17) % 100;
              const top = (i * 23) % 100;
              const delay = (i * 0.4) % 5;
              const duration = (i % 4) * 3 + 8; // 8s to 17s
              return (
                <motion.div
                  key={i}
                  className="absolute rounded-full bg-accent/70 dark:bg-accent/50 shadow-[0_0_12px_rgba(0,109,119,0.6)] backdrop-blur-[1px]"
                  style={{
                    width: size,
                    height: size,
                    left: `${left}%`,
                    top: `${top}%`,
                  }}
                  animate={{
                    y: [0, -160, 0],
                    x: [0, i % 2 === 0 ? 35 : -35, 0],
                    opacity: [0.2, 0.9, 0.2],
                    scale: [1, 1.5, 1]
                  }}
                  transition={{
                    duration,
                    repeat: Infinity,
                    delay,
                    ease: "easeInOut",
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};
