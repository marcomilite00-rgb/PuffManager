import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface BadgeProps {
    children: React.ReactNode;
    variant?: 'primary' | 'success' | 'danger' | 'warning' | 'surface' | 'ghost';
    size?: 'xs' | 'sm' | 'md' | 'lg';
    className?: ClassValue;
    icon?: React.ReactNode;
}

const cn = (...inputs: ClassValue[]) => {
    return twMerge(clsx(inputs));
};

export const Badge: React.FC<BadgeProps> = ({
    children,
    variant = 'surface',
    size = 'md',
    className,
    icon
}) => {
    const variants = {
        primary: 'bg-primary/20 text-primary border-primary/20',
        success: 'bg-success/10 text-success border-success/20',
        danger: 'bg-danger/10 text-danger border-danger/20',
        warning: 'bg-warning/10 text-warning border-warning/20',
        surface: 'bg-white/5 text-slate-400 border-white/5',
        ghost: 'bg-transparent text-slate-500 border-transparent',
    };

    const sizes = {
        xs: 'px-1.5 py-0.5 text-[8px]',
        sm: 'px-2 py-0.5 text-[9px]',
        md: 'px-3 py-1 text-[10px]',
        lg: 'px-4 py-1.5 text-xs',
    };

    return (
        <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full border font-black uppercase tracking-widest label-caps transition-all',
            variants[variant],
            sizes[size],
            className
        )}>
            {icon && <span className="shrink-0">{icon}</span>}
            {children}
        </span>
    );
};
