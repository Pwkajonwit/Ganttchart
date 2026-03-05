'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, LogIn, Loader2, AlertCircle, CheckCircle2, User, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type AuthMode = 'signin' | 'signup';
type MemberRole = 'admin' | 'project_manager' | 'engineer' | 'viewer';

export default function LoginPage() {
    const router = useRouter();
    const { login, register, isAuthenticated, loading: authLoading } = useAuth();

    const [mode, setMode] = useState<AuthMode>('signin');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [role, setRole] = useState<MemberRole>('viewer');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            router.push('/');
        }
    }, [isAuthenticated, authLoading, router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!email.trim()) {
            setError('Please enter email.');
            return;
        }

        if (!password) {
            setError('Please enter password.');
            return;
        }

        if (mode === 'signup') {
            if (!name.trim()) {
                setError('Please enter full name.');
                return;
            }
            const allowedRoles: MemberRole[] = ['admin', 'project_manager', 'engineer', 'viewer'];
            if (!allowedRoles.includes(role)) {
                setError('Please select role.');
                return;
            }

            if (password.length < 6) {
                setError('Password must be at least 6 characters.');
                return;
            }

            if (password !== confirmPassword) {
                setError('Password confirmation does not match.');
                return;
            }
        }

        setLoading(true);

        const result = mode === 'signin'
            ? await login(email, password)
            : await register(name, email, password, role);

        if (result.success) {
            setSuccess(result.message);
            setTimeout(() => {
                router.push('/');
            }, 500);
        } else {
            setError(result.message);
        }

        setLoading(false);
    };

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
                    <div className="mb-6 inline-flex w-full rounded-xl border border-gray-200 p-1 bg-gray-50">
                        <button
                            type="button"
                            onClick={() => {
                                setMode('signin');
                                setError('');
                                setSuccess('');
                                setRole('viewer');
                            }}
                            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${mode === 'signin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Sign in
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setMode('signup');
                                setError('');
                                setSuccess('');
                            }}
                            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            New member
                        </button>
                    </div>

                    <div className="text-center mb-6">
                        <h2 className="text-xl font-semibold text-gray-900">{mode === 'signin' ? 'Sign in' : 'Create member account'}</h2>
                        <p className="text-gray-500 text-sm mt-1">
                            {mode === 'signin' ? 'Use your registered email and password' : 'Create a new account and enter the system immediately'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {mode === 'signup' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Full name</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <User className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Your full name"
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                        disabled={loading}
                                    />
                                </div>
                            </div>
                        )}

                        {mode === 'signup' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as MemberRole)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    disabled={loading}
                                >
                                    <option value="viewer">Viewer</option>
                                    <option value="engineer">Engineer</option>
                                    <option value="project_manager">Project Manager</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Mail className="w-5 h-5 text-gray-400" />
                                </div>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="example@company.com"
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Lock className="w-5 h-5 text-gray-400" />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter password"
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        {mode === 'signup' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Confirm password</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="w-5 h-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Confirm password"
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                        disabled={loading}
                                    />
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {success && (
                            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-lg text-green-600 text-sm">
                                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                <span>{success}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium rounded-xl hover:from-blue-700 hover:to-blue-800 focus:ring-2 focus:ring-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                                </>
                            ) : (
                                <>
                                    {mode === 'signin' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                                    {mode === 'signin' ? 'Sign in' : 'Create account'}
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
