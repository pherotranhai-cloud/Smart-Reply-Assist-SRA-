import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { safeLocalStorage } from '../utils/safeStorage';
import {
  LAI_YIH_GOLD,
  LAI_YIH_GREEN,
  LOGO_FRAME_CENTERLINE_LEFT,
  LOGO_FRAME_CENTERLINE_RIGHT,
  LOGO_FRAME_PATH,
  LOGO_FRAME_THICKNESS,
  LOGO_L_PATH,
  LOGO_PLATE_PATH,
  LOGO_VIEWBOX,
  LOGO_Y_PATH,
} from './brand/LaiYihLogo';

interface SplashScreenProps {
  isDataLoaded: boolean;
  onComplete: () => void;
  t: (key: string) => string;
}

/**
 * "Dựng biển hiệu": the gold frame is drawn up from the middle of its base to
 * the top of the arch, the white plate opens, L then Y rise into it, a light
 * sweeps across and the group name settles in (keyframes: `.ly-splash` in
 * index.css). It runs once on a normal launch.
 *
 * Staff open the app many times per shift, so a launch within
 * REOPEN_WINDOW_MS of the previous one only shows the finished logo for
 * QUICK_MS. A device asking for reduced motion gets that same still logo.
 */
const FULL_MS = 2100;
const QUICK_MS = 600;
const REOPEN_WINDOW_MS = 30 * 60 * 1000;
const LAST_LAUNCH_KEY = 'sra_last_launch_at';

type SplashMode = 'full' | 'quick';

// Decided once per page load (module scope), so React StrictMode's double
// render cannot record the launch and then read it back as a re-open.
let launchMode: SplashMode | null = null;
function getLaunchMode(): SplashMode {
  if (launchMode) return launchMode;
  const now = Date.now();
  const last = Number(safeLocalStorage.getItem(LAST_LAUNCH_KEY) || 0);
  const reducedMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  launchMode = reducedMotion || (last > 0 && now - last < REOPEN_WINDOW_MS) ? 'quick' : 'full';
  safeLocalStorage.setItem(LAST_LAUNCH_KEY, String(now));
  return launchMode;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ isDataLoaded, onComplete, t }) => {
  const [mode] = useState<SplashMode>(getLaunchMode);
  const [minTimePassed, setMinTimePassed] = useState(false);

  // Hold for as long as the animation runs (or the short re-open hold).
  useEffect(() => {
    const timer = setTimeout(() => setMinTimePassed(true), mode === 'full' ? FULL_MS : QUICK_MS);
    return () => clearTimeout(timer);
  }, [mode]);

  // Leave only once both the animation and the app's data are ready.
  useEffect(() => {
    if (minTimePassed && isDataLoaded) onComplete();
  }, [minTimePassed, isDataLoaded, onComplete]);

  return (
    <motion.div
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.45, ease: [0.4, 0, 0.2, 1] } }}
      className={`ly-splash ly-splash--${mode} fixed inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden bg-[#020617] bg-[radial-gradient(circle_at_center,rgba(0,109,119,0.35)_0%,rgba(2,6,23,1)_75%)]`}
    >
      <div className="relative flex flex-col items-center" role="img" aria-label="Lai Yih Group">
        <svg viewBox={LOGO_VIEWBOX} className="w-[240px] md:w-[320px] overflow-visible" aria-hidden="true">
          <defs>
            <clipPath id="ly-splash-plate">
              <path d={LOGO_PLATE_PATH} />
            </clipPath>
            <linearGradient id="ly-splash-shine" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
              <stop offset="0.5" stopColor="#FFF6D6" stopOpacity="0.85" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="ly-plate" fill="#FFFFFF" d={LOGO_PLATE_PATH} />
          <g clipPath="url(#ly-splash-plate)">
            <path className="ly-letter-l" fill={LAI_YIH_GREEN} d={LOGO_L_PATH} />
            <path className="ly-letter-y" fill={LAI_YIH_GREEN} d={LOGO_Y_PATH} />
            <rect className="ly-shine" x="0" y="330" width="320" height="940" fill="url(#ly-splash-shine)" />
          </g>
          <path className="ly-frame" fill={LAI_YIH_GOLD} fillRule="evenodd" d={LOGO_FRAME_PATH} />
          <g className="ly-frame-draw" fill="none" stroke={LAI_YIH_GOLD} strokeWidth={LOGO_FRAME_THICKNESS} strokeLinejoin="miter">
            <path pathLength={1} strokeDasharray="1 1" d={LOGO_FRAME_CENTERLINE_LEFT} />
            <path pathLength={1} strokeDasharray="1 1" d={LOGO_FRAME_CENTERLINE_RIGHT} />
          </g>
        </svg>

        <h1 className="ly-wordmark mt-8 text-2xl font-bold text-white uppercase font-sans text-center drop-shadow-[0_2px_10px_rgba(255,255,255,0.1)]">
          Lai Yih Group
        </h1>
      </div>

      <div className="ly-footer absolute bottom-10 text-[10px] text-slate-400/60 tracking-widest uppercase">
        {t('manufacturingExcellence')}
      </div>
    </motion.div>
  );
};
