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
            <div className="flex items-center justify-center min-h-screen bg-surface-950 p-6">
                <div className="space-y-6 w-full max-w-md">
                    <div className="h-8 w-48 skeleton mx-auto" />
                    <div className="space-y-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="h-20 skeleton" />
                        ))}
                    </div>
                </div>
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
