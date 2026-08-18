import { motion } from 'motion/react';
import { X, Download, Share, PlusSquare } from 'lucide-react';

export const InstallBanner = ({ 
  deferredPrompt, 
  onInstall,
  onClose,
  isIosPromptVisible
}: { 
  deferredPrompt: any; 
  onInstall: () => void;
  onClose: () => void;
  isIosPromptVisible: boolean;
}) => {
  if (!deferredPrompt && !isIosPromptVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50 }}
      className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-panel border border-border-main shadow-xl rounded-2xl p-4 z-[9999] overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent to-blue-500" />
      <button onClick={onClose} className="absolute top-3 right-3 text-text-muted hover:text-text-main transition-colors">
        <X size={18} />
      </button>
      
      <div className="flex items-start gap-3 mt-1">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
          <Download size={20} className="text-accent" />
        </div>
        <div>
          <h4 className="text-[15px] font-semibold text-text-main">Cài đặt Ứng dụng</h4>
          
          {deferredPrompt ? (
            <>
              <p className="text-[13px] text-text-muted mt-1 mb-3">
                Cài đặt ứng dụng vào thiết bị để trải nghiệm mượt mà hơn và sử dụng ngoại tuyến.
              </p>
              <button 
                onClick={onInstall}
                className="px-4 py-2 bg-accent text-white rounded-xl text-[13px] font-medium hover:bg-accent/90 transition-colors shadow-sm"
              >
                Cài đặt ngay
              </button>
            </>
          ) : isIosPromptVisible ? (
            <div className="text-[13px] text-text-muted mt-1 space-y-2">
              <p>Thêm vào Màn hình chính trên iOS:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Nhấn vào biểu tượng <Share size={14} className="inline mx-1" /> (Chia sẻ) ở thanh công cụ Safari.</li>
                <li>Kéo xuống và chọn <strong>Thêm vào MH chính</strong> <PlusSquare size={14} className="inline mx-1" />.</li>
              </ol>
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
};
