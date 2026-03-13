import React from 'react';

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={`shimmer bg-white/5 rounded-lg ${className}`} />
);

export const VocabSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3, 4].map(i => (
      <div key={i} className="flex items-center gap-4 p-4 glass-panel">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="w-1/3 h-4" />
          <Skeleton className="w-2/3 h-3" />
        </div>
      </div>
    ))}
  </div>
);
