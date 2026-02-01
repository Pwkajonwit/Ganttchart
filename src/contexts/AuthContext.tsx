'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Member } from '@/types/construction';
import { getMembers } from '@/lib/firestore';

interface AuthContextType {
    user: Member | null;
    loading: boolean;
    login: (email: string) => Promise<{ success: boolean; message: string }>;
    logout: () => void;
    refreshUser: () => Promise<void>;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<Member | null>(null);
    const [loading, setLoading] = useState(true);

    // Check for existing session on mount
    useEffect(() => {
        const storedUser = localStorage.getItem('srt-hst-user');
        if (storedUser) {
            try {
                const parsedUser = JSON.parse(storedUser);
                setUser(parsedUser);
            } catch (error) {
                console.error('Error parsing stored user:', error);
                localStorage.removeItem('srt-hst-user');
            }
        }
        setLoading(false);
    }, []);

    const login = async (email: string): Promise<{ success: boolean; message: string }> => {
        try {
            const cleanEmail = email.trim().toLowerCase();
            console.log('Login attempt for:', cleanEmail);

            // Fetch members from Firebase
            const members = await getMembers();
            console.log('Available members in DB:', members.map(m => m.email));

            // Find member by email (case-insensitive and trimmed)
            const member = members.find(m => (m.email || '').trim().toLowerCase() === cleanEmail);

            if (!member) {
                console.warn(`User ${cleanEmail} not found in member list.`);
                return { success: false, message: `ไม่พบอีเมล "${cleanEmail}" ในระบบ (มีผู้ใช้งาน ${members.length} คน)` };
            }

            // Store user in state and localStorage
            setUser(member);
            localStorage.setItem('srt-hst-user', JSON.stringify(member));

            return { success: true, message: 'เข้าสู่ระบบสำเร็จ' };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + (error instanceof Error ? error.message : String(error)) };
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('srt-hst-user');
    };

    const refreshUser = async () => {
        if (!user) return;
        try {
            // Re-fetch members to get latest data
            const members = await getMembers();
            const updatedUser = members.find(m => m.id === user.id);

            if (updatedUser) {
                setUser(updatedUser);
                localStorage.setItem('srt-hst-user', JSON.stringify(updatedUser));
            }
        } catch (error) {
            console.error('Refresh user error:', error);
        }
    };

    const value = {
        user,
        loading,
        login,
        logout,
        refreshUser,
        isAuthenticated: !!user,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
