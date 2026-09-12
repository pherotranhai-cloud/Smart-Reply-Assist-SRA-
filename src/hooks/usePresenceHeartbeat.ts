import { useEffect } from 'react';

/**
 * Gửi nhịp "heartbeat" tới backend để Admin Dashboard đếm số người đang online.
 *
 * Mỗi tab giữ một sessionId riêng trong `sessionStorage`, ping ngay khi mount rồi
 * lặp lại mỗi 30 giây. Khi tab bị ẩn (`document.hidden`) nhịp ping tạm dừng và
 * chỉ chạy lại lúc tab hiển thị trở lại, nhờ vậy server tự loại các tab đã đóng
 * hoặc bị treo nền. Toàn bộ request là fire-and-forget: lỗi mạng hoặc endpoint
 * chưa tồn tại đều bị nuốt im lặng, không bao giờ nổi lên UI.
 */

const SERVER_BASE_URL = import.meta.env.VITE_RENDER_SERVER_URL || '';
const PRESENCE_SESSION_KEY = 'sra_presence_session';
const HEARTBEAT_INTERVAL_MS = 30_000;

// Giữ lại id trong bộ nhớ để tab vẫn ổn định khi sessionStorage bị chặn.
let cachedSessionId: string | null = null;

const createSessionId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (e) {
    // crypto.randomUUID chỉ khả dụng trong secure context -> rơi xuống fallback
  }
  return `sra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const getSessionId = (): string => {
  if (cachedSessionId) return cachedSessionId;

  // sessionStorage có thể ném SecurityError trong context nhúng/private.
  try {
    const existing = window.sessionStorage.getItem(PRESENCE_SESSION_KEY);
    if (existing) {
      cachedSessionId = existing;
      return existing;
    }
  } catch (e) {
    // Bỏ qua, dùng id tạo mới bên dưới
  }

  const generated = createSessionId();
  try {
    window.sessionStorage.setItem(PRESENCE_SESSION_KEY, generated);
  } catch (e) {
    // Không lưu được thì vẫn dùng bản cache trong bộ nhớ
  }

  cachedSessionId = generated;
  return generated;
};

export function usePresenceHeartbeat() {
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const ping = () => {
      fetch(`${SERVER_BASE_URL}/api/presence/ping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: getSessionId() })
      }).catch(() => { /* Presence là tính năng phụ: lỗi/404 đều bỏ qua */ });
    };

    const startPinging = () => {
      if (intervalId !== null) return;
      ping();
      intervalId = setInterval(ping, HEARTBEAT_INTERVAL_MS);
    };

    const stopPinging = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPinging();
      } else {
        startPinging();
      }
    };

    if (!document.hidden) {
      startPinging();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPinging();
    };
  }, []);
}
