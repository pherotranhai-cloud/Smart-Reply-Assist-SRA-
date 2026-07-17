import { useState, useEffect } from 'react';

export const useDeviceDetect = () => {
  const [isDesktop, setIsDesktop] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      // Định nghĩa màn hình Desktop từ kích thước 1024px (lg) trở lên
      setIsDesktop(window.innerWidth >= 1024);
    };

    // Chạy kiểm tra ngay khi mount
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { isDesktop };
};
