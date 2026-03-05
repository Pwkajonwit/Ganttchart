'use client';

import React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

// Layout content with sidebar awareness
function LayoutContent({ children }: { children: React.ReactNode }) {
    const { collapsed } = useSidebar();

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <div data-layout-content className={clsx(
                'flex-1 min-w-0 transition-all duration-200',
                collapsed ? 'lg:ml-16' : 'lg:ml-56'
            )}>
                <main data-layout-main className="p-6 min-w-0 max-w-full overflow-x-hidden">
                    {children}
                </main>
            </div>
        </div>
    );
}

// Protected Layout component that checks authentication
function ProtectedLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { isAuthenticated, loading } = useAuth();

    // Public routes that don't require authentication
    const publicRoutes = ['/login'];

    // Allow public access to gantt view if readonly=true
    const isSharedGantt = typeof window !== 'undefined'
        ? pathname.startsWith('/gantt') && new URLSearchParams(window.location.search).get('readonly') === 'true'
        : false;

    const isPublicRoute = publicRoutes.includes(pathname) || isSharedGantt;

    useEffect(() => {
        if (!loading && !isAuthenticated && !isPublicRoute) {
            router.push('/login');
        }
    }, [isAuthenticated, loading, isPublicRoute, router]);

    // Show loading spinner while checking auth
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                    <p className="text-gray-500 mt-2 text-sm">กำลังโหลด...</p>
                </div>
            </div>
        );
    }

    // If it's a public route (login), render without layout
    if (isPublicRoute) {
        if (isSharedGantt) {
            // Give shared gantt a clean layout without sidebar
            return <div className="min-h-screen bg-gray-50">{children}</div>;
        }
        return <>{children}</>;
    }

    // If not authenticated, don't render (will redirect)
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                    <p className="text-gray-500 mt-2 text-sm">กำลังเปลี่ยนเส้นทาง...</p>
                </div>
            </div>
        );
    }

    // Authenticated - render with Sidebar + Header layout
    return (
        <SidebarProvider>
            <LayoutContent>{children}</LayoutContent>
        </SidebarProvider>
    );
}

// Main wrapper with AuthProvider
export default function ClientLayout({ children }: { children: React.ReactNode }) {
    return (
        <AuthProvider>
            <ProtectedLayout>
                {children}
            </ProtectedLayout>
        </AuthProvider>
    );
}
