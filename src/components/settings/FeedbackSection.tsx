import React from 'react';
import { ChevronRight, MessageSquareWarning } from 'lucide-react';

interface FeedbackSectionProps {
  t: (key: string) => string;
  onOpen: () => void;
}

/**
 * The "Support & Feedback" row of the settings list. Shared by both panels so
 * the mobile and desktop rows cannot drift apart again.
 */
export const FeedbackSection: React.FC<FeedbackSectionProps> = ({ t, onOpen }) => (
  <section>
    <h3 className="text-[12px] font-medium text-text-muted uppercase tracking-widest px-4 mb-2">
      {t('supportFeedback')}
    </h3>
    {/* bg-surface is already theme- and wallpaper-correct (alpha 0.92-0.94), so this
        row needs no hasBgImage branch to stay readable over a wallpaper. */}
    <div className="bg-surface rounded-xl overflow-hidden shadow-sm border border-border-main">
      <button
        type="button"
        onClick={onOpen}
        className="w-full min-h-[52px] flex items-center justify-between gap-3 px-4 py-3 bg-transparent transition-colors hover:bg-border-main/20 active:bg-border-main/30"
      >
        <span className="flex items-center gap-3 min-w-0">
          <span className="w-7 h-7 shrink-0 rounded-md bg-accent flex items-center justify-center text-accent-on">
            <MessageSquareWarning size={16} />
          </span>
          <span className="text-[17px] text-text-main truncate">{t('feedbackErrorReport')}</span>
        </span>
        <ChevronRight size={20} className="text-text-muted shrink-0" />
      </button>
    </div>
  </section>
);
