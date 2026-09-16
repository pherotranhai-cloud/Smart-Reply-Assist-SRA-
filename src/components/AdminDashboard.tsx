import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, ShieldAlert, Users, Activity, MessageSquareText, RefreshCw, ChevronDown } from 'lucide-react';

const SERVER_BASE_URL = import.meta.env.VITE_RENDER_SERVER_URL || '';

/** Chu kỳ tự làm mới số người đang online. */
const ONLINE_REFRESH_MS = 15000;
/** Số phản hồi gần nhất được tải về. */
const RESPONSE_LIMIT = 50;

interface AdminDashboardProps {
  onClose: () => void;
  /**
   * The key the server accepted at unlock, sent on every admin request. Held in
   * React state for the session only — never localStorage, so it does not
   * outlive the tab or sit anywhere a later visitor could read it.
   */
  adminKey: string;
}

interface AdminMetrics {
  online: number;
  totalRequests: number;
  supabaseConfigured: boolean;
}

interface RecentResponse {
  task_type: string | null;
  input_text: string | null;
  output_text: string | null;
  from_lang: string | null;
  to_lang: string | null;
  created_at: string | null;
}

const EMPTY_METRICS: AdminMetrics = { online: 0, totalRequests: 0, supabaseConfigured: true };

/** Ép mọi giá trị lạ về một số nguyên không âm để UI không bao giờ hiển thị NaN. */
const toCount = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : 0;
};

/**
 * Mốc thời gian đủ ngắn để nằm cùng dòng với badge: chỉ giờ cho hôm nay,
 * thêm ngày/tháng cho các mốc cũ hơn. Mọi trường đều có thể null.
 */
const formatStamp = (value: string | null): string => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  const hhmmss = date.toLocaleTimeString('vi-VN', { hour12: false });
  if (date.toDateString() === new Date().toDateString()) return hhmmss;
  return `${date.getDate()}/${date.getMonth() + 1} ${hhmmss.slice(0, 5)}`;
};

/**
 * from_lang luôn là 'auto' (ai.ts hardcode), nên hiện "auto →" chỉ tốn chỗ.
 * Chỉ dựng mũi tên hai chiều khi nguồn thực sự mang thông tin.
 */
const langLabel = (from: string | null, to: string | null): string => {
  const target = to || '—';
  return from && from !== 'auto' ? `${from} → ${target}` : `→ ${target}`;
};

/**
 * Một dòng phản hồi: header gọn trên một dòng, rồi đầu vào và đầu ra.
 *
 * Thu gọn thì cắt bằng line-clamp thay vì cắt theo số ký tự — chữ Hán rộng
 * gấp đôi chữ Latin nên một ngưỡng ký tự cố định luôn sai cho ít nhất một bên.
 * Nhãn "ĐẦU VÀO"/"ĐẦU RA" bị bỏ: thứ tự và tương phản màu đã nói đủ.
 */
const ResponseCard: React.FC<{ item: RecentResponse }> = ({ item }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const input = item.input_text || '';
  const output = item.output_text || '';

  return (
    <button
      type="button"
      onClick={() => setIsExpanded(!isExpanded)}
      aria-expanded={isExpanded}
      className="w-full text-left bg-panel border border-border-main rounded-xl px-3 py-2 flex flex-col gap-0.5 hover:bg-border-main/20 transition-colors"
    >
      <div className="flex items-center gap-2 text-[11px] leading-4 text-text-muted">
        <span className="font-bold uppercase tracking-wider text-blue-500 shrink-0">
          {item.task_type || 'n/a'}
        </span>
        <span className="font-mono truncate">{langLabel(item.from_lang, item.to_lang)}</span>
        <span className="ml-auto shrink-0 tabular-nums">{formatStamp(item.created_at)}</span>
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </div>

      <p className={`text-[13px] text-text-muted break-words ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-1'}`}>
        {input || '(trống)'}
      </p>
      <p className={`text-sm text-text-main break-words ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
        {output || '(trống)'}
      </p>
    </button>
  );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose, adminKey }) => {
  const [metrics, setMetrics] = useState<AdminMetrics>(EMPTY_METRICS);
  const [metricsError, setMetricsError] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [responses, setResponses] = useState<RecentResponse[]>([]);
  const [responsesError, setResponsesError] = useState(false);
  const [responsesLoading, setResponsesLoading] = useState(true);

  // Chặn setState sau khi modal đã đóng (interval có thể còn một lượt fetch dở).
  const isMountedRef = useRef(true);

  // Memoised so the fetch callbacks below keep a stable identity — their effect
  // re-runs on a new one, which would restart the refresh interval each render.
  const authHeaders = useMemo(() => ({ 'x-admin-key': adminKey }), [adminKey]);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/metrics`, { headers: authHeaders });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!isMountedRef.current) return;
      setMetrics({
        online: toCount(data?.online),
        totalRequests: toCount(data?.totalRequests),
        supabaseConfigured: data?.supabaseConfigured !== false
      });
      setMetricsError(false);
    } catch (e) {
      console.error('[AdminDashboard] Không tải được chỉ số:', e);
      if (!isMountedRef.current) return;
      setMetrics(EMPTY_METRICS);
      setMetricsError(true);
    } finally {
      if (isMountedRef.current) setMetricsLoading(false);
    }
  }, [authHeaders]);

  const fetchResponses = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/responses?limit=${RESPONSE_LIMIT}`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!isMountedRef.current) return;
      setResponses(Array.isArray(data?.responses) ? data.responses.slice(0, RESPONSE_LIMIT) : []);
      setResponsesError(false);
    } catch (e) {
      console.error('[AdminDashboard] Không tải được danh sách phản hồi:', e);
      if (!isMountedRef.current) return;
      setResponses([]);
      setResponsesError(true);
    } finally {
      if (isMountedRef.current) setResponsesLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchMetrics();
    void fetchResponses();

    const timer = setInterval(() => {
      void fetchMetrics();
    }, ONLINE_REFRESH_MS);

    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
    };
  }, [fetchMetrics, fetchResponses]);

  const handleRefreshMetrics = () => {
    setMetricsLoading(true);
    void fetchMetrics();
  };

  const handleRefreshResponses = () => {
    setResponsesLoading(true);
    void fetchResponses();
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
            aria-label="Đóng bảng điều khiển"
            className="p-2 bg-panel rounded-full hover:bg-border-main/50 text-text-muted transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 pb-20">
          {/* Phân khu 1: Chỉ số hệ thống */}
          <section>
            <div className="flex justify-between items-center gap-3 mb-4">
              <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
                <Activity size={20} className="text-accent" />
                Chỉ số hệ thống
              </h3>
              <button
                onClick={handleRefreshMetrics}
                aria-label="Làm mới chỉ số hệ thống"
                className="p-2 bg-panel border border-border-main rounded-full text-text-muted hover:bg-border-main/50 transition-colors shrink-0"
              >
                <RefreshCw size={16} className={metricsLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-panel border border-border-main p-4 rounded-2xl shadow-sm">
                <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Users size={14} className="text-green-500 shrink-0" />
                  Người đang online
                </div>
                <div className="text-3xl font-bold text-text-main">{metrics.online}</div>
              </div>
              <div className="border border-accent/30 bg-accent/5 p-4 rounded-2xl shadow-sm">
                <div className="text-xs font-medium text-accent uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Activity size={14} className="shrink-0" />
                  Tổng Requests
                </div>
                <div className="text-3xl font-bold text-accent">{metrics.totalRequests}</div>
              </div>
            </div>

            <p className="text-xs text-text-muted mt-3">
              Số người online được cập nhật tự động mỗi 15 giây.
            </p>

            {metricsError && (
              <div className="mt-3 flex items-start gap-2 text-xs text-text-muted bg-panel border border-border-main rounded-xl px-3 py-2">
                <ShieldAlert size={14} className="text-red-500 shrink-0 mt-0.5" />
                <span>Không kết nối được máy chủ chỉ số. Tạm hiển thị giá trị 0.</span>
              </div>
            )}

            {!metricsError && !metrics.supabaseConfigured && (
              <div className="mt-3 flex items-start gap-2 text-xs text-text-muted bg-blue-500/10 border border-border-main rounded-xl px-3 py-2">
                <ShieldAlert size={14} className="text-blue-500 shrink-0 mt-0.5" />
                <span>Máy chủ chưa cấu hình Supabase, vì vậy “Tổng Requests” luôn bằng 0.</span>
              </div>
            )}
          </section>

          {/* Phân khu 2: 50 phản hồi gần nhất */}
          <section>
            <div className="flex justify-between items-center gap-3 mb-4">
              <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
                <MessageSquareText size={20} className="text-blue-500" />
                50 phản hồi gần nhất
              </h3>
              <button
                onClick={handleRefreshResponses}
                aria-label="Làm mới danh sách phản hồi"
                className="p-2 bg-panel border border-border-main rounded-full text-text-muted hover:bg-border-main/50 transition-colors shrink-0"
              >
                <RefreshCw size={16} className={responsesLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {responsesLoading && responses.length === 0 ? (
              <div className="text-center p-6 text-sm text-text-muted bg-panel rounded-2xl border border-border-main">
                Đang tải dữ liệu...
              </div>
            ) : responses.length === 0 ? (
              <div className="text-center p-6 text-sm text-text-muted bg-panel rounded-2xl border border-border-main">
                {responsesError
                  ? 'Không tải được danh sách phản hồi. Vui lòng thử làm mới.'
                  : 'Chưa có phản hồi nào được ghi nhận.'}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {responses.map((item, idx) => (
                  <ResponseCard key={`${item.created_at || 'na'}-${idx}`} item={item} />
                ))}
              </div>
            )}
          </section>
        </div>
      </motion.div>
    </div>
  );
};
