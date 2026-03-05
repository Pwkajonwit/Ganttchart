'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Loader2, ShieldAlert, Trash2, UserPlus, Users, X } from 'lucide-react';
import { createMember, deleteMember, getMembers, updateMember } from '@/lib/firestore';
import { Member } from '@/types/construction';
import { useAuth } from '@/contexts/AuthContext';

type MemberForm = {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: Member['role'];
};

const emptyForm: MemberForm = {
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'viewer'
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export default function MembersPage() {
    const { user, refreshUser } = useAuth();
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [memberForm, setMemberForm] = useState<MemberForm>(emptyForm);

    const fetchMembersData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getMembers();
            setMembers(data);
        } catch (error) {
            console.error('Error fetching members:', error);
            alert('Failed to load members');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMembersData();
    }, [fetchMembersData]);

    const adminCount = useMemo(
        () => members.filter((member) => member.role === 'admin').length,
        [members]
    );

    const openCreateModal = () => {
        setEditingMember(null);
        setMemberForm(emptyForm);
        setIsModalOpen(true);
    };

    const openEditModal = (member: Member) => {
        setEditingMember(member);
        setMemberForm({
            name: member.name || '',
            email: member.email || '',
            phone: member.phone || '',
            password: '',
            role: member.role
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingMember(null);
        setMemberForm(emptyForm);
    };

    const handleSave = async () => {
        const normalizedEmail = normalizeEmail(memberForm.email);
        const trimmedPassword = memberForm.password.trim();

        if (!memberForm.name.trim() || !normalizedEmail) {
            alert('Please provide both name and email');
            return;
        }

        if (!editingMember && !trimmedPassword) {
            alert('Please provide password for new member');
            return;
        }

        if (trimmedPassword && trimmedPassword.length < 6) {
            alert('Password must be at least 6 characters');
            return;
        }

        const duplicatedEmail = members.find((member) => {
            const memberEmail = normalizeEmail(String(member.email || ''));
            if (editingMember && member.id === editingMember.id) return false;
            return memberEmail === normalizedEmail;
        });

        if (duplicatedEmail) {
            alert('This email is already in use');
            return;
        }

        setSaving(true);
        try {
            if (editingMember) {
                const updatePayload: Partial<Member> = {
                    name: memberForm.name.trim(),
                    email: normalizedEmail,
                    phone: memberForm.phone.trim(),
                    role: memberForm.role
                };

                if (trimmedPassword) {
                    updatePayload.password = trimmedPassword;
                }

                await updateMember(editingMember.id, updatePayload);

                if (user && editingMember.id === user.id) {
                    await refreshUser();
                }
            } else {
                await createMember({
                    name: memberForm.name.trim(),
                    email: normalizedEmail,
                    phone: memberForm.phone.trim(),
                    password: trimmedPassword,
                    role: memberForm.role
                });
            }

            await fetchMembersData();
            closeModal();
        } catch (error) {
            console.error('Error saving member:', error);
            alert('Failed to save member');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (member: Member) => {
        if (member.role === 'admin' && adminCount <= 1) {
            alert('Cannot delete the last admin user');
            return;
        }

        const confirmed = window.confirm(`Delete member ${member.name}?`);
        if (!confirmed) return;

        try {
            await deleteMember(member.id);
            await fetchMembersData();
        } catch (error) {
            console.error('Error deleting member:', error);
            alert('Failed to delete member');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-500">Loading members...</span>
            </div>
        );
    }

    if (!user || user.role !== 'admin') {
        return (
            <div className="bg-white rounded border border-gray-200 p-8 text-center">
                <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                <h1 className="text-lg font-semibold text-gray-900">No Permission</h1>
                <p className="text-gray-500 text-sm mt-1">Only admin can manage members.</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <Users className="w-6 h-6 text-blue-600" />
                        User Management
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">All members that can sign in to the system</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                    <UserPlus className="w-4 h-4" />
                    Add Member
                </button>
            </div>

            <div className="bg-white rounded border border-gray-200 overflow-hidden">
                <div className="divide-y divide-gray-100">
                    {members.map((member) => (
                        <div key={member.id} className="px-5 py-4 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="font-medium text-gray-900 truncate">{member.name}</p>
                                <p className="text-sm text-gray-500 truncate">{member.email}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Role: <span className="font-medium">{member.role}</span> | Password: <span className={member.password ? 'text-green-600' : 'text-amber-600'}>{member.password ? 'Set' : 'Not set'}</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => openEditModal(member)}
                                    className="p-2 rounded-sm text-gray-500 hover:text-blue-700 hover:bg-gray-100"
                                    title="Edit"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(member)}
                                    className="p-2 rounded-sm text-gray-500 hover:text-red-700 hover:bg-gray-100"
                                    title="Delete"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
                    Total members: <span className="font-medium text-gray-900">{members.length}</span>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 p-4 flex items-center justify-center">
                    <div className="bg-white w-full max-w-md rounded border border-gray-200">
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-900">{editingMember ? 'Edit Member' : 'Add Member'}</h2>
                            <button onClick={closeModal} className="p-1 rounded-sm hover:bg-gray-100 text-gray-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Name *</label>
                                <input
                                    type="text"
                                    value={memberForm.name}
                                    onChange={(e) => setMemberForm((prev) => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
                                <input
                                    type="email"
                                    value={memberForm.email}
                                    onChange={(e) => setMemberForm((prev) => ({ ...prev, email: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password {editingMember ? '(leave blank to keep current)' : '*'}</label>
                                <input
                                    type="password"
                                    value={memberForm.password}
                                    onChange={(e) => setMemberForm((prev) => ({ ...prev, password: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
                                <input
                                    type="tel"
                                    value={memberForm.phone}
                                    onChange={(e) => setMemberForm((prev) => ({ ...prev, phone: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                                <select
                                    value={memberForm.role}
                                    onChange={(e) => setMemberForm((prev) => ({ ...prev, role: e.target.value as Member['role'] }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm"
                                >
                                    <option value="admin">admin</option>
                                    <option value="project_manager">project_manager</option>
                                    <option value="engineer">engineer</option>
                                    <option value="viewer">viewer</option>
                                </select>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
                            <button onClick={closeModal} className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-sm hover:bg-gray-200">Cancel</button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {editingMember ? 'Save' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
