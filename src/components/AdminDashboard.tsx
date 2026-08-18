import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, BarChart3, MessageSquare, Ban, Search } from 'lucide-react';

const SERVER_BASE_URL = import.meta.env.VITE_RENDER_SERVER_URL || '';

interface AdminDashboardProps {
  onClose: () => void;
}

const DeviceCard = ({ ip, onStatusUpdate }: { ip: any, onStatusUpdate: (id: string, status: 'good' | 'warning' | 'block') => void }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-panel border border-border-main rounded-2xl p-4 flex flex-col gap-4 shadow-sm relative overflow-hidden">
      <div className="flex justify-between items-start gap-4">
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm font-bold text-text-main font-mono truncate" title={ip.device_uuid || ip.ip_address}>
            {ip.device_uuid ? `UUID: ${ip.device_uuid.substring(0, 8)}...` : ip.ip_address}
          </span>
          <span className="text-xs text-text-muted mt-1">{ip.last_request_at ? new Date(ip.last_request_at).toLocaleString() : 'N/A'}</span>
        </div>
        <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider shrink-0 ${ip.status === 'block' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : ip.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
          {ip.status}
        </span>
      </div>

      {ip.spam_logs && (
        <div className="flex flex-col gap-2">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-center gap-2 text-xs text-blue-400 font-medium bg-blue-500/10 px-4 py-2 rounded-xl hover:bg-blue-500/20 transition-colors w-full"
          >
            <Search size={14} /> {isExpanded ? 'Ẩn nhật ký spam' : '🔍 Xem nhật ký spam'}
          </button>
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="text-xs text-text-muted bg-bg-main p-3 rounded-xl border border-border-main whitespace-pre-wrap font-mono mt-2 max-h-64 overflow-y-auto">
                  {ip.spam_logs}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="flex gap-3 mt-2">
        {ip.status !== 'block' && (
          <button 
            onClick={() => onStatusUpdate(ip.ip_address, 'block')}
            className="flex-1 h-11 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center"
          >
            Khóa vĩnh viễn
          </button>
        )}
        <button 
          onClick={() => onStatusUpdate(ip.ip_address, 'good')}
          className="flex-1 h-11 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center"
        >
          Mở khóa / Hợp lệ
        </button>
      </div>
    </div>
  );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
  const [stats, setStats] = useState({ day: 0, week: 0, month: 0, totalRequests: 0 });
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [ipTrackers, setIpTrackers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      await Promise.all([
        fetchKPIData(),
        fetchFeedbacks(),
        fetchIPTrackerData()
      ]);
      setLoading(false);
    };
    loadAllData();
  }, []);

  const fetchKPIData = async () => {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/kpis`);
      if (res.ok) {
        const data = await res.json();
        setStats({
          day: data.stats?.day || 0,
          week: data.stats?.week || 0,
          month: data.stats?.month || 0,
          totalRequests: data.stats?.totalRequests || 0
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchFeedbacks = async () => {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/feedbacks`);
      if (res.ok) {
        const result = await res.json();
        if (result && Array.isArray(result.feedbacks)) {
          setFeedbacks(result.feedbacks);
        } else if (Array.isArray(result)) {
          setFeedbacks(result);
        } else {
          setFeedbacks([]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchIPTrackerData = async () => {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/devices`);
      if (res.ok) {
        const data = await res.json();
        setIpTrackers(data.ipTrackers || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateIPStatus = async (ipAddress: string, status: 'good' | 'warning' | 'block') => {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/device-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip_address: ipAddress, status })
      });
      if (res.ok) {
        alert(`Đã chuyển trạng thái thiết bị ${ipAddress} sang ${status.toUpperCase()}.`);
        fetchIPTrackerData();
      } else {
        alert('Cập nhật trạng thái thất bại.');
      }
    } catch (e) {
      console.error(e);
      alert('Đã xảy ra lỗi.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md font-sans">
      <motion.div
        initial={{ opacity: 0, y: "100%" }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: "100%" }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="bg-bg-main sm:border border-border-main sm:rounded-2xl w-full max-w-2xl h-[90vh] sm:h-[85vh] overflow-hidden shadow-2xl flex flex-col rounded-t-3xl"
      >
        <div className="p-5 border-b border-border-main flex justify-between items-center bg-bg-input sticky top-0 z-10">
          <h2 className="text-xl font-bold text-text-main flex items-center gap-3">
            <ShieldAlert className="text-red-500" />
            Admin Dashboard
          </h2>
          <button 
            onClick={onClose}
            className="p-2 bg-panel rounded-full hover:bg-border-main/50 text-text-muted transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-10 pb-20">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-text-muted">Đang tải dữ liệu...</div>
          ) : (
            <>
              {/* Phân khu 1: KPIs */}
              <section>
                <h3 className="text-lg font-bold text-text-main mb-4 flex items-center gap-2">
                  <BarChart3 size={20} className="text-blue-500" />
                  Tổng quan lượt truy cập
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-panel border border-border-main p-4 rounded-2xl shadow-sm">
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Hôm nay</div>
                    <div className="text-3xl font-bold text-text-main">{stats.day}</div>
                  </div>
                  <div className="bg-panel border border-border-main p-4 rounded-2xl shadow-sm">
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Tuần này</div>
                    <div className="text-3xl font-bold text-text-main">{stats.week}</div>
                  </div>
                  <div className="bg-panel border border-border-main p-4 rounded-2xl shadow-sm">
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Tháng này</div>
                    <div className="text-3xl font-bold text-accent">{stats.month}</div>
                  </div>
                  <div className="bg-panel border border-border-main p-4 rounded-2xl shadow-sm border-accent/30 bg-accent/5">
                    <div className="text-xs font-medium text-accent uppercase tracking-wider mb-1">Tổng Requests</div>
                    <div className="text-3xl font-bold text-accent">{stats.totalRequests}</div>
                  </div>
                </div>
              </section>

              {/* Phân khu 2: Feedbacks */}
              <section>
                <h3 className="text-lg font-bold text-text-main mb-4 flex items-center gap-2">
                  <MessageSquare size={20} className="text-purple-500" />
                  Ý kiến người dùng
                </h3>
                {feedbacks.length === 0 ? (
                  <div className="text-center p-6 text-sm text-text-muted bg-panel rounded-2xl border border-border-main">
                    Chưa có ý kiến phản hồi nào.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {feedbacks.map((fb, idx) => (
                      <div key={idx} className="bg-panel border border-border-main p-4 rounded-2xl shadow-sm flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted">{fb.created_at ? new Date(fb.created_at).toLocaleString() : ''}</span>
                          <span className="text-xs font-medium bg-border-main/50 px-2 py-0.5 rounded text-text-muted">{fb.interface_lang || 'unknown'}</span>
                        </div>
                        <p className="text-sm text-text-main">{fb.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Phân khu 3: Quản lý IP / Thiết bị */}
              <section>
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-text-main mb-1 flex items-center gap-2">
                    <Ban size={20} className="text-red-500" />
                    Quản Lý Thiết Bị Toàn Cục
                  </h3>
                  <p className="text-xs text-slate-500 opacity-80">
                    Hệ thống quản lý trạng thái truy cập theo mã định danh thiết bị.
                  </p>
                </div>
                
                {ipTrackers.length === 0 ? (
                  <div className="text-center p-6 text-sm text-text-muted bg-panel rounded-2xl border border-border-main">
                    Không có thiết bị nào được ghi nhận.
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {ipTrackers.map((ip, idx) => (
                      <DeviceCard key={idx} ip={ip} onStatusUpdate={handleUpdateIPStatus} />
                    ))}
                  </div>
                )}
              </section>

            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};
