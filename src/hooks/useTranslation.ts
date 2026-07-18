import { useState, useEffect } from 'react';
import { translations } from '../i18n';
import { safeLocalStorage } from '../utils/safeStorage';

export function useTranslation() {
  const [lang, setLang] = useState<string>(() => {
    try {
      const stored = safeLocalStorage.getItem('sra_global_language');
      if (stored) {
        if (stored.startsWith('"') && stored.endsWith('"')) {
          return JSON.parse(stored);
        }
        return stored;
      }
    } catch (e) {}
    return 'en';
  });

  useEffect(() => {
    const handleStorageChange = () => {
      try {
        const stored = safeLocalStorage.getItem('sra_global_language');
        if (stored) {
          const parsed = (stored.startsWith('"') && stored.endsWith('"')) ? JSON.parse(stored) : stored;
          if (parsed && parsed !== lang) {
            setLang(parsed);
          }
        }
      } catch (e) {}
    };

    window.addEventListener('storage', handleStorageChange);
    const interval = setInterval(handleStorageChange, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [lang]);

  const t = (key: string, defaultValue?: string) => {
    const dict = (translations as any)[lang] || translations['en'];
    const fallback = translations['en'] as any;
    return dict[key] || fallback[key] || defaultValue || key;
  };

  return { t, i18n: { language: lang } };
}
