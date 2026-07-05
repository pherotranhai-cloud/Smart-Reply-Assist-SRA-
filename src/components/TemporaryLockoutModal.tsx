import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

interface TemporaryLockoutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TemporaryLockoutModal: React.FC<TemporaryLockoutModalProps> = ({ isOpen, onClose }) => {
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    if (!isOpen) return;
    setCountdown(60);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 10 }}
        className="ios-glass border border-border-main/50 rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col items-center text-center bg-card"
      >
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 mb-4 animate-bounce">
          <AlertTriangle size={32} />
        </div>

        <h3 className="text-lg font-bold text-text-main mb-2">Hệ thống tạm khóa</h3>
        <p className="text-[14px] text-text-muted leading-relaxed mb-6">
          Bạn đã thực hiện thao tác quá nhanh. Để bảo vệ tài nguyên hệ thống, vui lòng chờ trong giây lát.
        </p>

        <div className="relative w-24 h-24 flex items-center justify-center">
          {/* Animated circular progress indicator using simple conic-gradient or SVG */}
          <svg className="absolute w-full h-full transform -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="var(--border-main)"
              strokeWidth="4"
              fill="transparent"
              className="opacity-20"
            />
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="var(--accent)"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={251.2}
              strokeDashoffset={251.2 - (251.2 * countdown) / 60}
              className="transition-all duration-1000"
            />
          </svg>
          <span className="text-3xl font-extrabold text-accent font-mono">
            {countdown}s
          </span>
        </div>

        <div className="mt-6 text-xs text-text-muted">
          Tự động mở khóa sau khi đếm ngược kết thúc
        </div>
      </motion.div>
    </div>
  );
};
