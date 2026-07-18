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
          className="fixed inset-0 z-[-10] pointer-events-none transition-all duration-700 bg-cover bg-center ease-in-out"
          style={{ 
            backgroundImage: `url(${backgroundImage})`,
          }}
        />
      )}

      {/* hardware-accelerated backdrops */}
      <div className="fixed inset-0 z-[-9] pointer-events-none overflow-hidden">
        {backgroundEffect === 'liquid-glow' && (
          <div className="absolute inset-0 opacity-30 blur-[100px] transform-gpu">
            <motion.div 
              animate={{ 
                x: [0, 160, -120, 0],
                y: [0, -160, 120, 0],
              }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
              className="absolute top-1/4 left-1/4 w-[350px] h-[350px] rounded-full bg-pink-500/30 dark:bg-pink-500/20"
            />
            <motion.div 
              animate={{ 
                x: [0, -140, 160, 0],
                y: [0, 140, -160, 0],
              }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-cyan-500/30 dark:bg-cyan-500/20"
            />
          </div>
        )}

        {backgroundEffect === 'particles' && (
          <div className="absolute inset-0 opacity-40 transform-gpu">
            {[...Array(12)].map((_, i) => {
              const size = Math.random() * 5 + 3;
              const left = Math.random() * 100;
              const top = Math.random() * 100;
              const delay = Math.random() * 4;
              const duration = Math.random() * 8 + 8;
              return (
                <motion.div
                  key={i}
                  className="absolute rounded-full bg-accent/25 dark:bg-accent/15 backdrop-blur-[1px]"
                  style={{
                    width: size,
                    height: size,
                    left: `${left}%`,
                    top: `${top}%`,
                  }}
                  animate={{
                    y: [0, -120, 0],
                    opacity: [0.15, 0.7, 0.15],
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
