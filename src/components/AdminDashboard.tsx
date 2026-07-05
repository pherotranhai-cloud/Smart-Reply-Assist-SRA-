import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, ShieldAlert, BarChart3, MessageSquare, Ban } from 'lucide-react';

interface AdminDashboardProps {
  onClose: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'feedbacks' | 'blacklist'>('stats');
  const [stats, setStats] = useState({ day: 0, week: 0, month: 0 });
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [ipTrackers, setIpTrackers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/data');
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setFeedbacks(data.feedbacks);
        setLogs(data.logs);
        setIpTrackers(data.ipTrackers || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateIPStatus = async (ipAddress: string, status: 'good' | 'warning' | 'block') => {
    try {
      const res = await fetch('/api/admin/ip-tracker/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip_address: ipAddress, status })
      });
      if (res.ok) {
        alert(`Đã chuyển trạng thái IP ${ipAddress} sang ${status.toUpperCase()}.`);
        fetchData();
      } else {
        alert('Cập nhật trạng thái thất bại.');
      }
    } catch (e) {
      console.error(e);
      alert('Đã xảy ra lỗi.');
    }
  };

  const handleBlockIP = async (ip: string) => {
    await handleUpdateIPStatus(ip, 'block');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="bg-panel border border-border-main rounded-2xl w-full max-w-5xl h-[85vh] overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="p-4 border-b border-border-main flex justify-between items-center bg-bg-input">
          <h2 className="text-xl font-bold text-text-main flex items-center gap-2">
            <ShieldAlert className="text-red-500" />
            Security Admin Dashboard
          </h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-border-main/50 text-text-muted transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-border-main p-4 space-y-2 bg-bg-main/50">
            <button
              onClick={() => setActiveTab('stats')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'stats' ? 'bg-accent text-white' : 'text-text-muted hover:bg-border-main/50 hover:text-text-main'}`}
            >
              <BarChart3 size={18} /> KPIs & Tần Suất
            </button>
            <button
              onClick={() => setActiveTab('feedbacks')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'feedbacks' ? 'bg-accent text-white' : 'text-text-muted hover:bg-border-main/50 hover:text-text-main'}`}
            >
              <MessageSquare size={18} /> User Feedbacks
            </button>
            <button
              onClick={() => setActiveTab('blacklist')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${activeTab === 'blacklist' ? 'bg-accent text-white' : 'text-text-muted hover:bg-border-main/50 hover:text-text-main'}`}
            >
              <Ban size={18} /> Quản Lý Spam & IP
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full text-text-muted">Đang tải dữ liệu...</div>
            ) : (
              <>
                {activeTab === 'stats' && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-bold text-text-main mb-4">Tổng quan lượt truy cập</h3>
                    <div className="grid grid-cols-3 gap-6">
                      <div className="bg-panel border border-border-main p-6 rounded-2xl shadow-sm">
                        <div className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-2">Hôm nay</div>
                        <div className="text-4xl font-bold text-text-main">{stats.day}</div>
                      </div>
                      <div className="bg-panel border border-border-main p-6 rounded-2xl shadow-sm">
                        <div className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-2">Tuần này</div>
                        <div className="text-4xl font-bold text-text-main">{stats.week}</div>
                      </div>
                      <div className="bg-panel border border-border-main p-6 rounded-2xl shadow-sm">
                        <div className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-2">Tháng này</div>
                        <div className="text-4xl font-bold text-accent">{stats.month}</div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'feedbacks' && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-text-main mb-4">Ý kiến người dùng</h3>
                    <div className="bg-panel rounded-xl border border-border-main overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-bg-input border-b border-border-main text-xs uppercase text-slate-400 font-medium">
                          <tr>
                            <th className="px-4 py-3">Ngày</th>
                            <th className="px-4 py-3">Nội dung</th>
                            <th className="px-4 py-3">Ngôn ngữ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-main">
                          {feedbacks.map((fb, idx) => (
                            <tr key={idx} className="hover:bg-border-main/10">
                              <td className="px-4 py-3 text-sm text-text-muted whitespace-nowrap">{new Date(fb.created_at).toLocaleString()}</td>
                              <td className="px-4 py-3 text-sm text-text-main">{fb.content}</td>
                              <td className="px-4 py-3 text-sm text-text-muted whitespace-nowrap">{fb.lang}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {feedbacks.length === 0 && <div className="p-4 text-center text-text-muted">Không có dữ liệu</div>}
                    </div>
                  </div>
                )}

                {activeTab === 'blacklist' && (
                  <div className="space-y-6">
                    {/* Spam & IP Block Management Section */}
                    <div>
                      <h3 className="text-lg font-bold text-text-main mb-4 flex items-center gap-2">
                        <Ban size={20} className="text-red-500" />
                        Spam & IP Block Management
                      </h3>
                      <div className="bg-panel rounded-xl border border-border-main overflow-hidden mb-6">
                        <table className="w-full text-left">
                          <thead className="bg-bg-input border-b border-border-main text-xs uppercase text-slate-400 font-medium">
                            <tr>
                              <th className="px-4 py-3">IP Address</th>
                              <th className="px-4 py-3">Trạng thái</th>
                              <th className="px-4 py-3">Nhật ký Spam (Spam Logs)</th>
                              <th className="px-4 py-3">Hoạt động cuối</th>
                              <th className="px-4 py-3 text-right">Hành động</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-main">
                            {ipTrackers.filter((ip: any) => ip.status === 'warning' || ip.status === 'block').map((ip: any, idx: number) => (
                              <tr key={idx} className="hover:bg-border-main/10">
                                <td className="px-4 py-3 text-sm font-mono text-text-main whitespace-nowrap">{ip.ip_address}</td>
                                <td className="px-4 py-3 text-sm whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ip.status === 'block' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}>
                                    {ip.status.toUpperCase()}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-text-muted max-w-xs truncate" title={ip.spam_logs}>
                                  {ip.spam_logs || 'Không có logs'}
                                </td>
                                <td className="px-4 py-3 text-sm text-text-muted whitespace-nowrap">
                                  {ip.last_request_at ? new Date(ip.last_request_at).toLocaleString() : 'N/A'}
                                </td>
                                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                                  {ip.status !== 'block' && (
                                    <button 
                                      onClick={() => handleUpdateIPStatus(ip.ip_address, 'block')}
                                      className="px-2.5 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-xs font-semibold transition-colors"
                                    >
                                      Khóa vĩnh viễn
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => handleUpdateIPStatus(ip.ip_address, 'good')}
                                    className="px-2.5 py-1.5 bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white rounded-lg text-xs font-semibold transition-colors"
                                  >
                                    Mở khóa / Hợp lệ
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {ipTrackers.filter((ip: any) => ip.status === 'warning' || ip.status === 'block').length === 0 && (
                              <tr>
                                <td colSpan={5} className="p-4 text-center text-text-muted text-sm">Không có IP nào bị warning hoặc block.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Request Logs Section */}
                    <div>
                      <h3 className="text-lg font-bold text-text-main mb-4">Nhật ký request & Chặn IP nhanh</h3>
                      <div className="bg-panel rounded-xl border border-border-main overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-bg-input border-b border-border-main text-xs uppercase text-slate-400 font-medium">
                            <tr>
                              <th className="px-4 py-3">Thời gian</th>
                              <th className="px-4 py-3">IP Address</th>
                              <th className="px-4 py-3">Nội dung Request</th>
                              <th className="px-4 py-3 text-right">Hành động</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-main">
                            {logs.map((log, idx) => (
                              <tr key={idx} className="hover:bg-border-main/10">
                                <td className="px-4 py-3 text-sm text-text-muted whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                                <td className="px-4 py-3 text-sm font-mono text-text-muted whitespace-nowrap">{log.ip_address || 'Unknown'}</td>
                                <td className="px-4 py-3 text-sm text-text-main max-w-xs truncate" title={log.input_text}>{log.input_text}</td>
                                <td className="px-4 py-3 text-right">
                                  {log.ip_address && (
                                    <button 
                                      onClick={() => handleBlockIP(log.ip_address)}
                                      className="px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-xs font-semibold transition-colors"
                                    >
                                      Cấm IP Vĩnh Viễn
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {logs.length === 0 && <div className="p-4 text-center text-text-muted">Không có dữ liệu</div>}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
