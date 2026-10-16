import React from 'react';
import { cn } from '../../lib/cn';

export interface SpatialToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const SpatialToggle: React.FC<SpatialToggleProps> = ({
  checked,
  onChange,
  disabled = false,
  className,
  'aria-label': ariaLabel = 'Attiva o disattiva opzione',
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onChange(!checked);
        }
      }}
      className={cn(
        'spatial-toggle-track focus-visible:outline-2 focus-visible:outline-[#0A84FF] focus-visible:outline-offset-2',
        checked && 'spatial-toggle-track-on',
        disabled && 'opacity-40 cursor-not-allowed',
        className
      )}
    >
      <span className="spatial-toggle-knob" />
    </button>
  );
};
