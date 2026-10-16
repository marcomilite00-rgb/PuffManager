import React from 'react';

interface PageSkeletonProps {
  titleClass?: string;
  blocks?: { count: number; className: string }[];
}

export const PageSkeleton: React.FC<PageSkeletonProps> = ({
  titleClass = 'w-48 h-9',
  blocks = [],
}) => (
  <div className="w-full space-y-5 animate-pulse" aria-busy="true" aria-label="Caricamento in corso">
    <div className={`${titleClass} spatial-skeleton rounded-2xl`} />
    {blocks.map((block, i) => (
      <div key={i} className={block.count > 1 ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : undefined}>
        {[...Array(block.count)].map((_, j) => (
          <div key={j} className={`${block.className} spatial-skeleton rounded-2xl`} />
        ))}
      </div>
    ))}
  </div>
);
