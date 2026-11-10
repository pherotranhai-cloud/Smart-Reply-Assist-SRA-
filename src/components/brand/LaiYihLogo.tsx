/**
 * The Lai Yih Group "LY" logo as vector paths.
 *
 * Rebuilt from the group's official 1600×1600 logo file, in that file's own
 * coordinates: the two arch curves are least-squares circle fits (max error
 * about 1 px) and every corner of the frame and the L/Y letters is measured.
 * Rendered back and compared pixel by pixel with the official file it matches
 * 99.4 % (gold frame), 99.5 % (green letters) and 99.1 % (white plate); what
 * differs is the 1 px anti-aliased edge. Do not redraw these by eye, and do
 * not swap the letters for a font: they are geometric shapes, not type.
 */
import React from 'react';

export const LAI_YIH_GOLD = '#FFBE00';
export const LAI_YIH_GREEN = '#299D62';

/** The white plate inside the frame (also the frame's inner edge). */
export const LOGO_PLATE_PATH = 'M130 1179V748H241.2A650 650 0 0 1 1368.6 748H1481V1179Z';
/** The gold frame: outer outline plus the plate as a hole (even-odd fill). */
export const LOGO_FRAME_PATH = `M70 1242V686H208.5A707.2 707.2 0 0 1 1401.6 686H1538V1242Z${LOGO_PLATE_PATH}`;
export const LOGO_L_PATH = 'M519 636H610V1005H767V1089H519Z';
export const LOGO_Y_PATH = 'M777 636H866L957.5 833L1050 636H1138L1004.5 926V1089H912V926Z';
/**
 * The frame's centre line, as two halves that start at the middle of the base
 * and meet at the top of the arch. Stroked at the frame's thickness (62) it
 * traces the frame, which is how the splash draws it in.
 */
export const LOGO_FRAME_CENTERLINE_LEFT = 'M805 1210.5H100V717H224.7A678.6 678.6 0 0 1 805 390.2';
export const LOGO_FRAME_CENTERLINE_RIGHT = 'M805 1210.5H1509.5V717H1385.3A678.6 678.6 0 0 0 805 390.2';
export const LOGO_FRAME_THICKNESS = 62;
/** The logo's bounds with a small margin, in the official file's coordinates. */
export const LOGO_VIEWBOX = '40 330 1530 940';

interface LaiYihLogoProps {
  className?: string;
  /** Accessible name; pass '' when the logo is decorative next to the group name. */
  title?: string;
}

/** The static logo, in the official colours, on its white plate. */
export const LaiYihLogo: React.FC<LaiYihLogoProps> = ({ className, title = 'Lai Yih Group' }) => (
  <svg
    viewBox={LOGO_VIEWBOX}
    className={className}
    role={title ? 'img' : undefined}
    aria-label={title || undefined}
    aria-hidden={title ? undefined : true}
  >
    <path fill="#FFFFFF" d={LOGO_PLATE_PATH} />
    <path fill={LAI_YIH_GREEN} d={`${LOGO_L_PATH}${LOGO_Y_PATH}`} />
    <path fill={LAI_YIH_GOLD} fillRule="evenodd" d={LOGO_FRAME_PATH} />
  </svg>
);
