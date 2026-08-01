import React from 'react';

interface PageSkeletonProps {
  titleClass?: string;
  blocks?: { count: number; className: string }[];
}

export const PageSkeleton: React.FC<PageSkeletonProps> = ({
  titleClass = 'w-48 h-10',
  blocks = [],
}) => (
  <div className="p-6 space-y-8">
    <div className={`${titleClass} skeleton`} />
    {blocks.map((block, i) => (
      <div key={i} className={block.count > 1 ? 'grid grid-cols-2 md:grid-cols-3 gap-4' : undefined}>
        {[...Array(block.count)].map((_, j) => (
          <div key={j} className={`${block.className} skeleton`} />
        ))}
      </div>
    ))}
  </div>
);
