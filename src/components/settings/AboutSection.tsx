import React, { useId } from 'react';
import { Languages } from 'lucide-react';
import { APP_VERSION } from '../../config/version';

interface AboutSectionProps {
  t: (key: string) => string;
}

/**
 * iOS app-info block: the app icon tile and name, a version row underneath, and
 * the product description as the section footer. Shared by both panels so the
 * mobile and desktop copies cannot drift apart.
 */
export const AboutSection: React.FC<AboutSectionProps> = ({ t }) => {
  const headingId = useId();
  const footerId = useId();

  return (
    <section>
      <h3
        id={headingId}
        className="text-[11px] font-medium text-text-muted uppercase tracking-widest px-4 mb-2"
      >
        {t('about')}
      </h3>
      {/* bg-surface is already theme- and wallpaper-correct (alpha 0.92-0.94), so
          this card needs no hasBgImage branch to stay readable over a wallpaper. */}
      <div
        aria-labelledby={headingId}
        aria-describedby={footerId}
        className="rounded-xl overflow-hidden shadow-sm border border-border-main bg-surface backdrop-blur-xl"
      >
        <div className="flex items-stretch gap-3 pl-4">
          <span className="flex items-center shrink-0">
            <span className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-accent-on shadow-sm">
              <Languages size={26} />
            </span>
          </span>
          {/* Hairline lives on the content, so it insets to the label like iOS. */}
          <span className="flex-1 min-w-0 flex items-center pr-4 py-2 min-h-[52px] border-b border-border-main">
            <span className="block min-w-0 truncate text-[17px] font-semibold text-text-main">
              {t('appName')}
            </span>
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2 min-h-[52px]">
          <span className="min-w-0 truncate text-[17px] text-text-main">{t('about.version')}</span>
          {/* APP_VERSION already carries its leading "v" — see config/version.ts. */}
          <span className="shrink-0 text-[17px] text-text-muted tabular-nums">{APP_VERSION}</span>
        </div>
      </div>
      <p id={footerId} className="text-[12px] text-text-muted px-4 mt-2 leading-relaxed">
        {t('appDescription')}
      </p>
    </section>
  );
};
