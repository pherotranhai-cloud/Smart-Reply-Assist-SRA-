import React from 'react';
import { motion } from 'motion/react';
import { ShieldX, Mail } from 'lucide-react';

export const PermanentBanOverlay: React.FC = () => {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full p-8 rounded-3xl border border-red-500/20 bg-slate-900/50 shadow-2xl shadow-red-500/5 flex flex-col items-center text-center font-sans text-slate-100"
      >
        <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-6 shadow-[0_0_30px_rgba(239,68,68,0.1)]">
          <ShieldX size={44} />
        </div>

        <h2 className="text-2xl font-black text-white tracking-tight mb-4">
          Thiết bị đã bị khóa vĩnh viễn
        </h2>

        <p className="text-[14px] text-slate-400 leading-relaxed mb-8">
          Hệ thống quản trị phát hiện hành vi cố tình phá hoại hoặc spam liên tục từ địa chỉ IP của bạn.
          Quyền truy cập vào ứng dụng SRA đã bị đình chỉ vô thời hạn. Vui lòng liên hệ với Quản trị viên để xác minh và mở khóa.
        </p>

        <div className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-red-400 font-medium text-xs uppercase tracking-wider">
            <Mail size={14} /> Email hỗ trợ kỹ thuật
          </div>
          <a
            href="mailto:hai.45588@lacty2.com.vn"
            className="text-lg font-bold text-accent hover:underline break-all"
          >
            hai.45588@lacty2.com.vn
          </a>
        </div>
      </motion.div>
    </div>
  );
};
