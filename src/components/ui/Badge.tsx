import React from 'react';
import { cn } from '../../lib/cn';
import type { ClassValue } from 'clsx';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'primary' | 'success' | 'danger' | 'warning' | 'surface' | 'ghost';
    size?: 'xs' | 'sm' | 'md' | 'lg';
    className?: ClassValue;
    icon?: React.ReactNode;
}

const variantClass: Record<NonNullable<BadgeProps['variant']>, string> = {
    primary: 'ios-chip-blue',
    success: 'ios-chip-green',
    danger: 'ios-chip-red',
    warning: 'ios-chip-orange',
    surface: 'ios-chip-gray',
    ghost: 'ios-chip-gray',
};

const sizes = {
    xs: 'text-[11px] px-2 py-0.5',
    sm: 'text-xs px-2.5 py-0.5',
    md: 'text-[13px] px-3 py-1',
    lg: 'text-sm px-3.5 py-1',
};

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'surface', size = 'md', className, icon }) => {
    return (
        <span className={cn('ios-chip', variantClass[variant], sizes[size], className)}>
            {icon && <span className="shrink-0 inline-flex">{icon}</span>}
            {children}
        </span>
    );
};
