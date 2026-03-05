'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Member } from '@/types/construction';
import { createMember, getMembers } from '@/lib/firestore';

interface AuthContextType {
    user: Member | null;
    loading: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; message: string }>;
    register: (name: string, email: string, password: string, role: Member['role']) => Promise<{ success: boolean; message: string }>;
    logout: () => void;
    refreshUser: () => Promise<void>;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const sanitizeMember = (member: Member): Member => {
    const { password, ...safeMember } = member;
    return safeMember;
};

const normalizeEmail = (value: unknown): string => String(value ?? '').trim().toLowerCase();

const getPasswordCandidates = (value: unknown): string[] => {
    const raw = String(value ?? '');
    const trimmed = raw.trim();
    const withoutLeadingQuote = trimmed.startsWith("'") ? trimmed.slice(1) : trimmed;
    return Array.from(new Set([raw, trimmed, withoutLeadingQuote]));
};

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<Member | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedUser = localStorage.getItem('srt-hst-user');
        if (storedUser) {
            try {
                const parsedUser = JSON.parse(storedUser) as Member;
                setUser(sanitizeMember(parsedUser));
            } catch (error) {
                console.error('Error parsing stored user:', error);
                localStorage.removeItem('srt-hst-user');
            }
        }
        setLoading(false);
    }, []);

    const login = async (email: string, password: string): Promise<{ success: boolean; message: string }> => {
        try {
            const members = await getMembers();
            const normalizedEmail = normalizeEmail(email);
            const member = members.find((m) => normalizeEmail(m.email) === normalizedEmail);

            if (!member) {
                return { success: false, message: 'Email not found. Please contact administrator.' };
            }

            if (!member.password) {
                return { success: false, message: 'This account has no password set yet.' };
            }

            const inputCandidates = getPasswordCandidates(password);
            const memberPasswordCandidates = getPasswordCandidates(member.password);
            const passwordMatched = inputCandidates.some((candidate) => memberPasswordCandidates.includes(candidate));

            if (!passwordMatched) {
                return { success: false, message: 'Invalid password.' };
            }

            const safeMember = sanitizeMember(member);
            setUser(safeMember);
            localStorage.setItem('srt-hst-user', JSON.stringify(safeMember));

            return { success: true, message: 'Login successful.' };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, message: 'An error occurred during login.' };
        }
    };

    const register = async (name: string, email: string, password: string, role: Member['role']): Promise<{ success: boolean; message: string }> => {
        try {
            const normalizedEmail = normalizeEmail(email);
            const cleanName = String(name || '').trim();
            const cleanPassword = String(password || '').trim();
            const validRoles: Member['role'][] = ['admin', 'project_manager', 'engineer', 'viewer'];
            const cleanRole: Member['role'] = validRoles.includes(role) ? role : 'viewer';

            if (!cleanName || !normalizedEmail || !cleanPassword) {
                return { success: false, message: 'Please provide name, email, and password.' };
            }

            const members = await getMembers();
            const exists = members.some((m) => normalizeEmail(m.email) === normalizedEmail);

            if (exists) {
                return { success: false, message: 'This email is already registered.' };
            }

            const memberId = await createMember({
                name: cleanName,
                email: normalizedEmail,
                password: cleanPassword,
                phone: '',
                role: cleanRole
            });

            const safeMember = sanitizeMember({
                id: memberId,
                name: cleanName,
                email: normalizedEmail,
                role: cleanRole,
                phone: ''
            } as Member);

            setUser(safeMember);
            localStorage.setItem('srt-hst-user', JSON.stringify(safeMember));

            return { success: true, message: 'Account created successfully.' };
        } catch (error) {
            console.error('Register error:', error);
            return { success: false, message: 'Failed to create account.' };
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('srt-hst-user');
    };

    const refreshUser = async () => {
        if (!user) return;
        try {
            const members = await getMembers();
            const updatedUser = members.find((m) => m.id === user.id);

            if (updatedUser) {
                const safeMember = sanitizeMember(updatedUser);
                setUser(safeMember);
                localStorage.setItem('srt-hst-user', JSON.stringify(safeMember));
            }
        } catch (error) {
            console.error('Refresh user error:', error);
        }
    };

    const value = {
        user,
        loading,
        login,
        register,
        logout,
        refreshUser,
        isAuthenticated: !!user,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
