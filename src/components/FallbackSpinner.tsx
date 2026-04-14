import React from 'react';
import { Loader2 } from 'lucide-react';

export const FallbackSpinner: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[50vh] space-y-4">
      <div className="relative">
        <div className="absolute inset-0 rounded-full blur-md bg-accent/30 animate-pulse"></div>
        <Loader2 className="relative animate-spin text-accent" size={48} />
      </div>
      <p className="text-sm font-medium tracking-widest text-text-muted uppercase animate-pulse">Loading module...</p>
    </div>
  );
};
