import { useState, useEffect } from 'react';

const DESKTOP_MIN_WIDTH = 1024;

const detectDesktop = () =>
  typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN_WIDTH;

export const useDeviceDetect = () => {
  // Resolved during the first render: initialising to `false` made every mount
  // paint the mobile layout for one frame before flipping to desktop.
  const [isDesktop, setIsDesktop] = useState<boolean>(detectDesktop);

  useEffect(() => {
    const handleResize = () => {
      // Định nghĩa màn hình Desktop từ kích thước 1024px (lg) trở lên
      setIsDesktop(detectDesktop());
    };

    // Chạy kiểm tra ngay khi mount
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { isDesktop };
};
