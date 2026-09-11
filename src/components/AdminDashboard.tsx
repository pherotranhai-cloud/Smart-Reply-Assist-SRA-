import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, Users, Activity, MessageSquareText, RefreshCw } from 'lucide-react';

const SERVER_BASE_URL = import.meta.env.VITE_RENDER_SERVER_URL || '';

/** Chu kỳ tự làm mới số người đang online. */
const ONLINE_REFRESH_MS = 15000;
/** Số phản hồi gần nhất được tải về. */
const RESPONSE_LIMIT = 50;
/** Độ dài tối đa của đoạn xem trước trước khi bấm để mở rộng. */
const PREVIEW_LENGTH = 140;

interface AdminDashboardProps {
  onClose: () => void;
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

/** Mọi trường đều có thể null, nên luôn trả về chuỗi an toàn. */
const formatDateTime = (value: string | null): string => {
  if (!value) return 'Không rõ thời gian';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Không rõ thời gian';
  return date.toLocaleString('vi-VN');
};

const truncate = (value: string | null, max: number): string => {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

const ResponseCard: React.FC<{ item: RecentResponse }> = ({ item }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const input = item.input_text || '';
  const output = item.output_text || '';
  const canExpand = input.length > PREVIEW_LENGTH || output.length > PREVIEW_LENGTH;
  const fromLang = item.from_lang || '—';
  const toLang = item.to_lang || '—';

  return (
    <div className="bg-panel border border-border-main rounded-2xl p-4 flex flex-col gap-3 shadow-sm overflow-hidden">
      <div className="flex justify-between items-center gap-3">
        <span className="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider bg-blue-500/10 text-blue-500 shrink-0 max-w-[60%] truncate">
          {item.task_type || 'không rõ'}
        </span>
        <span className="text-xs text-text-muted text-right truncate">{formatDateTime(item.created_at)}</span>
      </div>

      <div className="text-xs font-mono text-text-muted">
        {fromLang} <span className="text-accent">→</span> {toLang}
      </div>

      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="flex flex-col gap-2 text-left w-full"
      >
        <div className="text-sm text-text-main whitespace-pre-wrap break-words">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-0.5">Đầu vào</span>
          {input ? (isExpanded ? input : truncate(input, PREVIEW_LENGTH)) : <span className="text-text-muted">(trống)</span>}
        </div>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden w-full"
            >
              <div className="text-sm text-text-main bg-bg-main p-3 rounded-xl border border-border-main whitespace-pre-wrap break-words max-h-64 overflow-y-auto mt-1">
                <span className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1">Đầu ra</span>
                {output || <span className="text-text-muted">(trống)</span>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isExpanded && (
          <div className="text-sm text-text-muted whitespace-pre-wrap break-words">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-0.5">Đầu ra</span>
            {output ? truncate(output, PREVIEW_LENGTH) : '(trống)'}
          </div>
        )}

        <span className="text-xs font-medium text-accent">
          {isExpanded ? 'Thu gọn' : canExpand ? 'Bấm để xem đầy đủ' : 'Bấm để xem chi tiết'}
        </span>
      </button>
    </div>
  );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
  const [metrics, setMetrics] = useState<AdminMetrics>(EMPTY_METRICS);
  const [metricsError, setMetricsError] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [responses, setResponses] = useState<RecentResponse[]>([]);
  const [responsesError, setResponsesError] = useState(false);
  const [responsesLoading, setResponsesLoading] = useState(true);

  // Chặn setState sau khi modal đã đóng (interval có thể còn một lượt fetch dở).
  const isMountedRef = useRef(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/metrics`);
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
  }, []);

  const fetchResponses = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_BASE_URL}/api/admin/responses?limit=${RESPONSE_LIMIT}`);
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
  }, []);

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

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-10 pb-20">
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
              <div className="flex flex-col gap-3">
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
