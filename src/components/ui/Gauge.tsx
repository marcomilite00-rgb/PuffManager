import React from 'react';
import { cn } from '../../lib/cn';

export interface GaugeProps {
  value: number; // 0 to 100
  size?: number;
  strokeWidth?: number;
  color?: string;
  className?: string;
  children?: React.ReactNode;
}

export const Gauge: React.FC<GaugeProps> = ({
  value,
  size = 180,
  strokeWidth = 12,
  color = '#0A84FF',
  className,
  children,
}) => {
  const clampedValue = Math.min(100, Math.max(0, isNaN(value) ? 0 : value));
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const sweepRatio = 0.75; // 270 degrees sweep
  const arcLength = circumference * sweepRatio;
  const progressLength = (clampedValue / 100) * arcLength;

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--gauge-track, rgba(255, 255, 255, 0.12))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          transform={`rotate(135 ${center} ${center})`}
        />
        {/* Progress Arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${progressLength} ${circumference}`}
          transform={`rotate(135 ${center} ${center})`}
          style={{
            transition: 'stroke-dasharray 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            filter: `drop-shadow(0 0 6px ${color}66)`,
          }}
        />
      </svg>
      {/* Centered Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 pointer-events-none">
        <div className="pointer-events-auto">{children}</div>
      </div>
    </div>
  );
};
