import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { StaffRole } from '../../types/database';

interface ProtectedRouteProps {
    allowedRoles?: StaffRole[];
    redirectTo?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    allowedRoles,
    redirectTo = '/login'
}) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to={redirectTo} replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role.toLowerCase() as StaffRole)) {
        return <Navigate to="/vendita" replace />;
    }

    return <Outlet />;
};
