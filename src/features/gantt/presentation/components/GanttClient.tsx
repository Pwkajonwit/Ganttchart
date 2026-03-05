'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import GanttChart from '@/components/charts/gantt/GanttChart';
import { Calendar, Loader2, FolderKanban, Plus, TrendingUp, Layout, ChevronDown, Layers, ArrowLeft, Target, Share2, Lock, Key } from 'lucide-react';
import Link from 'next/link';
import { Project, Task, Employee } from '@/types/construction';
import { getProjects, getTasks, updateTask, createTask, getEmployees } from '@/lib/firestore';
import { format, parseISO, addDays, startOfWeek, endOfWeek, subWeeks, addWeeks } from 'date-fns';
import { COST_CODES, getCostCodeName } from '@/constants/costCodes';
import AddTaskModal from '@/components/gantt/modals/AddTaskModal';
import ProgressUpdateModal from '@/components/gantt/modals/ProgressUpdateModal';
import { ViewMode } from '@/shared/chart-kernel/types';
import { useAuth } from '@/contexts/AuthContext';

type GanttWindowMode = 'project' | '4w';

export default function GanttClient({
    preSelectedProjectId,
    windowMode = 'project',
    pageTitle = 'Gantt Chart',
    pageSubtitle = 'Project planning and scheduling',
    isProcurementPage = false
}: {
    preSelectedProjectId?: string;
    windowMode?: GanttWindowMode;
    pageTitle?: string;
    pageSubtitle?: string;
    isProcurementPage?: boolean;
} = {}) {
    const searchParams = useSearchParams();
    const projectParam = preSelectedProjectId || searchParams.get('project') || searchParams.get('projectId');

    const { user } = useAuth();
    const canEdit = ['admin', 'project_manager'].includes(user?.role || '');

    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [chartViewMode, setChartViewMode] = useState<ViewMode>('day');

    const readonlyParam = searchParams.get('readonly') === 'true';
    const isReadOnly = readonlyParam || !canEdit;

    // UI State for Dropdowns
    const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
    const viewMenuRef = React.useRef<HTMLDivElement>(null);

    const [showAddTaskModal, setShowAddTaskModal] = useState(false);
    const [addTaskInitialData, setAddTaskInitialData] = useState<Record<string, unknown> | undefined>(undefined);
    const [progressModalTask, setProgressModalTask] = useState<Task | undefined>(undefined);
    const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(new Set());
    const [isApplyingOffsets, setIsApplyingOffsets] = useState(false);

    // Share link PIN states
    const encodedPin = searchParams.get('p');
    const [isPinVerified, setIsPinVerified] = useState(!encodedPin);
    const [enteredPin, setEnteredPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [showShareModal, setShowShareModal] = useState(false);
    const [sharePin, setSharePin] = useState('');

    const [procurementOffsets, setProcurementOffsets] = useState<{
        dueProcurementDays: number;
        dueMaterialOnSiteDays: number;
        dateOfUseOffsetDays: number;
    }>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('gantt_procurement_offsets_v1');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved) as Partial<{
                        dueProcurementDays: number;
                        dueMaterialOnSiteDays: number;
                        dateOfUseOffsetDays: number;
                    }>;
                    return {
                        dueProcurementDays: parsed.dueProcurementDays ?? -14,
                        dueMaterialOnSiteDays: parsed.dueMaterialOnSiteDays ?? -7,
                        dateOfUseOffsetDays: parsed.dateOfUseOffsetDays ?? 0
                    };
                } catch {
                    return { dueProcurementDays: -14, dueMaterialOnSiteDays: -7, dateOfUseOffsetDays: 0 };
                }
            }
        }
        return { dueProcurementDays: -14, dueMaterialOnSiteDays: -7, dateOfUseOffsetDays: 0 };
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem('gantt_procurement_offsets_v1', JSON.stringify(procurementOffsets));
    }, [procurementOffsets]);


    const existingCategories = [...new Set(tasks.map((t) => t.category))].filter(Boolean);

    const fetchProjects = useCallback(async () => {
        try {
            setLoading(true);
            const projectsData = await getProjects();
            setProjects(projectsData);

            if (projectsData.length > 0 && !projectParam) {
                setSelectedProjectId(projectsData[0].id);
            }
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setLoading(false);
        }
    }, [projectParam]);

    const fetchTasks = useCallback(async () => {
        try {
            if (!selectedProjectId) return;
            const tasksData = await getTasks(selectedProjectId);
            setTasks(tasksData);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        }
    }, [selectedProjectId]);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    useEffect(() => {
        if (projectParam && projects.length > 0) {
            setSelectedProjectId(projectParam);
        }
    }, [projectParam, projects]);

    useEffect(() => {
        if (selectedProjectId) {
            fetchTasks();
        }
    }, [selectedProjectId, fetchTasks]);

    useEffect(() => {
        if (windowMode === '4w' && chartViewMode !== 'day') {
            setChartViewMode('day');
        }
    }, [windowMode, chartViewMode]);

    useEffect(() => {
        const fetchEmployees = async () => {
            try {
                const data = await getEmployees();
                setEmployees(data);
            } catch (error) {
                console.error('Error fetching employees:', error);
            }
        };
        fetchEmployees();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
                setIsViewMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const openProgressModal = (taskId: string) => {
        const task = tasks.find((t) => t.id === taskId);
        if (task) {
            setProgressModalTask(task);
        }
    };

    const handleProgressUpdate = async (taskId: string, newProgress: number, updateDate: string, reason: string) => {
        try {
            const task = tasks.find((t) => t.id === taskId);
            if (!task) return;

            const isStartingWork = newProgress === -1;
            const actualProgress = isStartingWork ? 0 : newProgress;

            let newStatus: Task['status'] = 'not-started';
            if (actualProgress === 100) newStatus = 'completed';
            else if (actualProgress > 0 || isStartingWork) newStatus = 'in-progress';

            const updateData: Partial<Task> = {
                progress: actualProgress,
                progressUpdatedAt: updateDate,
                status: newStatus
            };

            if (reason) updateData.remarks = reason;

            if (isStartingWork) {
                updateData.actualStartDate = updateDate;
            } else if (actualProgress === 0) {
                if (newStatus === 'in-progress') {
                    if (!task.actualStartDate) updateData.actualStartDate = updateDate;
                } else {
                    updateData.actualStartDate = '';
                }
            } else if (actualProgress > 0) {
                if (!task.actualStartDate) {
                    updateData.actualStartDate = task.planStartDate;
                } else if (updateDate < task.actualStartDate) {
                    updateData.actualStartDate = updateDate;
                }
            }

            if (actualProgress === 100) {
                updateData.actualEndDate = updateDate;
            } else if (task.actualEndDate) {
                updateData.actualEndDate = '';
            }

            await updateTask(taskId, updateData);
            fetchTasks();
        } catch (error) {
            console.error('Error updating progress:', error);
            alert('Failed to update progress.');
        }
    };

    const handleAddSubTask = (parentId: string) => {
        const parent = tasks.find((t) => t.id === parentId);
        if (parent) {
            const siblingTasks = tasks.filter((t) => t.parentTaskId === parentId && t.type !== 'group');

            let defaultStartDate = format(new Date(), 'yyyy-MM-dd');

            if (siblingTasks.length > 0) {
                let maxEndDate = siblingTasks[0].planEndDate;
                siblingTasks.forEach((t) => {
                    if (t.planEndDate > maxEndDate) maxEndDate = t.planEndDate;
                });
                try {
                    const nextDay = addDays(parseISO(maxEndDate), 1);
                    defaultStartDate = format(nextDay, 'yyyy-MM-dd');
                } catch {
                    defaultStartDate = maxEndDate;
                }
            } else if (parent.planStartDate) {
                defaultStartDate = parent.planStartDate;
            }

            setAddTaskInitialData({
                parentTaskId: parentId,
                category: parent.category,
                subcategory: parent.subcategory || '',
                subsubcategory: parent.subsubcategory || '',
                type: 'task',
                planStartDate: defaultStartDate
            });
            setShowAddTaskModal(true);
        }
    };

    const handleAddTaskToCategory = (category: string, subcategory?: string, subsubcategory?: string) => {
        setAddTaskInitialData({
            category,
            subcategory,
            subsubcategory,
            type: 'task',
            planStartDate: format(new Date(), 'yyyy-MM-dd')
        });
        setShowAddTaskModal(true);
    };

    const handleAddTask = async (newTaskData: Record<string, unknown>, autoLink: boolean) => {
        if (!selectedProjectId) return;

        try {
            const durationValue = String(newTaskData.duration ?? '1');
            const planDuration = Math.max(1, parseInt(durationValue, 10) || 1);

            const planStartDate = String(newTaskData.planStartDate ?? format(new Date(), 'yyyy-MM-dd'));
            const storageEndDate = (() => {
                try {
                    const start = parseISO(planStartDate);
                    const end = addDays(start, planDuration - 1);
                    return format(end, 'yyyy-MM-dd');
                } catch {
                    return planStartDate;
                }
            })();

            const currentMaxOrder = tasks.length > 0 ? Math.max(...tasks.map((t) => t.order || 0)) : 0;

            let predecessorId: string | undefined;
            if (autoLink) {
                const parentTaskId = String(newTaskData.parentTaskId || '');
                if (parentTaskId) {
                    const siblings = tasks.filter((t) => t.parentTaskId === parentTaskId);
                    if (siblings.length > 0) predecessorId = siblings[siblings.length - 1].id;
                } else if (tasks.length > 0) {
                    predecessorId = tasks[tasks.length - 1].id;
                }
            }

            await createTask({
                projectId: selectedProjectId,
                name: String(newTaskData.name || ''),
                category: String(newTaskData.category || ''),
                subcategory: String(newTaskData.subcategory || '') || undefined,
                subsubcategory: String(newTaskData.subsubcategory || '') || undefined,
                type: (String(newTaskData.type || 'task') as Task['type']),
                planStartDate,
                planEndDate: storageEndDate,
                planDuration,
                cost: newTaskData.cost ? parseFloat(String(newTaskData.cost)) : 0,
                quantity: String(newTaskData.quantity || '') || undefined,
                responsible: String(newTaskData.responsible || '') || undefined,
                progress: 0,
                status: 'not-started',
                order: currentMaxOrder + 1,
                parentTaskId: String(newTaskData.parentTaskId || '') || undefined,
                color: String(newTaskData.color || '') || undefined,
                predecessors: predecessorId ? [predecessorId] : undefined
            });

            fetchTasks();
            setShowAddTaskModal(false);
            setAddTaskInitialData(undefined);
        } catch (error) {
            console.error('Error creating task:', error);
            alert('Failed to create task.');
        }
    };

    const selectedProject = projects.find((p) => p.id === selectedProjectId);
    const fourWeekRange = React.useMemo(() => {
        const today = new Date();
        const start = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
        const end = endOfWeek(addWeeks(today, 2), { weekStartsOn: 1 });
        return {
            startDate: format(start, 'yyyy-MM-dd'),
            endDate: format(end, 'yyyy-MM-dd')
        };
    }, []);
    const effectiveStartDate = windowMode === '4w' ? fourWeekRange.startDate : selectedProject?.startDate;
    const effectiveEndDate = windowMode === '4w' ? fourWeekRange.endDate : selectedProject?.endDate;

    const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
        try {
            setUpdatingTaskIds((prev) => {
                const next = new Set(prev);
                next.add(taskId);
                return next;
            });

            setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t)));
            await updateTask(taskId, updates);
            fetchTasks();
        } catch (error) {
            console.error('Error updating task:', error);
            fetchTasks();
        } finally {
            setUpdatingTaskIds((prev) => {
                const next = new Set(prev);
                next.delete(taskId);
                return next;
            });
        }
    };

    const handleApplyProcurementOffsetsToAll = async () => {
        if (!confirm('This will update Procurement Dates for ALL visible tasks based on the current offsets. This cannot be undone automatically. Continue?')) {
            return;
        }

        setIsApplyingOffsets(true);
        try {
            // Filter eligible leaf tasks
            const eligibleTasks = tasks.filter(t => t.type !== 'group' && t.planStartDate);

            const updates = eligibleTasks.map(async (task) => {
                try {
                    const start = parseISO(task.planStartDate);
                    const dueProcurementDate = format(addDays(start, procurementOffsets.dueProcurementDays), 'yyyy-MM-dd');
                    const dueMaterialOnSiteDate = format(addDays(start, procurementOffsets.dueMaterialOnSiteDays), 'yyyy-MM-dd');
                    const dateOfUse = format(addDays(start, procurementOffsets.dateOfUseOffsetDays), 'yyyy-MM-dd');

                    await updateTask(task.id, {
                        dueProcurementDate,
                        dueMaterialOnSiteDate,
                        dateOfUse
                    });
                } catch (e) {
                    console.error(`Error processing task ${task.id}`, e);
                }
            });

            await Promise.all(updates);
            await fetchTasks();
        } catch (error) {
            console.error('Error applying procurement offsets:', error);
            alert('Failed to update all items.');
        } finally {
            setIsApplyingOffsets(false);
        }
    };

    const handleShareClick = () => {
        setShowShareModal(true);
    };

    const copyShareLink = () => {
        const url = new URL(window.location.href);
        url.searchParams.set('readonly', 'true');
        if (sharePin) {
            url.searchParams.set('p', btoa(sharePin));
        }
        navigator.clipboard.writeText(url.toString());
        setShowShareModal(false);
        setSharePin('');
        alert('คัดลอกลิงก์สำหรับแชร์เรียบร้อยแล้ว!');
    };

    const handleVerifyPin = (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (btoa(enteredPin) === encodedPin) {
                setIsPinVerified(true);
                setPinError('');
            } else {
                setPinError('รหัส PIN ไม่ถูกต้อง');
                setEnteredPin('');
            }
        } catch {
            setPinError('Invalid PIN format');
        }
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-2 text-gray-500">Loading data...</span>
            </div>
        );
    }

    if (!isPinVerified) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center">
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 max-w-sm w-full text-center">
                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock className="w-8 h-8" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">ใส่รหัส PIN เพื่อเข้าดู</h2>
                    <p className="text-sm text-gray-500 mb-6">กรุณาระบุรหัส PIN 6 หลักที่ได้รับจากผู้แชร์โครงการ</p>

                    <form onSubmit={handleVerifyPin}>
                        <input
                            type="password"
                            maxLength={6}
                            value={enteredPin}
                            onChange={(e) => setEnteredPin(e.target.value)}
                            placeholder="******"
                            className="w-full text-center tracking-[0.5em] text-2xl font-bold py-3 px-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-2"
                        />
                        {pinError && <p className="text-red-500 text-sm mb-4">{pinError}</p>}
                        {!pinError && <div className="h-6"></div>}

                        <button
                            type="submit"
                            className="w-full bg-blue-600 text-white font-medium py-3 rounded-xl hover:bg-blue-700 transition-colors"
                        >
                            ยืนยันรหัส PIN
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-blue-600" />
                        {pageTitle}
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">{pageSubtitle}</p>
                </div>

                <div className="bg-white rounded border border-gray-300 p-12 text-center shadow-none">
                    <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4 text-sm">No projects found. Please create a project first.</p>
                    <Link
                        href="/projects"
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 inline-block transition-colors"
                    >
                        Go to Projects
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 font-sans">
            {selectedProject && (
                <div className="gantt-page-header flex items-start justify-between gap-4 relative z-[100]">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                            <Calendar className="w-6 h-6 text-blue-600" />
                            {pageTitle}
                        </h1>
                        <p className="text-gray-500 text-sm mt-0.5">{pageSubtitle}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        {/* Views Dropdown */}
                        <div className="relative" ref={viewMenuRef}>
                            <button
                                onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
                                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-sm hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                            >
                                <Layout className="w-4 h-4 text-gray-500" />
                                Views
                                <ChevronDown className="w-3 h-3 text-gray-400" />
                            </button>

                            {isViewMenuOpen && (
                                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded shadow-lg z-[110] py-1">
                                    <Link
                                        href={`/projects/${selectedProject.id}`}
                                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => setIsViewMenuOpen(false)}
                                    >
                                        <ArrowLeft className="w-4 h-4 text-gray-500" />
                                        Back to Details
                                    </Link>
                                    <div className="h-px bg-gray-100 my-1" />
                                    <Link
                                        href={`/gantt/${selectedProject.id}`}
                                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => setIsViewMenuOpen(false)}
                                    >
                                        <Layers className="w-4 h-4 text-blue-600" />
                                        Gantt Chart
                                    </Link>
                                    <Link
                                        href={`/cost-code/${selectedProject.id}`}
                                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => setIsViewMenuOpen(false)}
                                    >
                                        <Target className="w-4 h-4 text-purple-600" />
                                        Cost Code Summary
                                    </Link>
                                    <Link
                                        href={`/gantt-4w/${selectedProject.id}`}
                                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => setIsViewMenuOpen(false)}
                                    >
                                        <Calendar className="w-4 h-4 text-indigo-600" />
                                        4-Week Lookahead
                                    </Link>
                                    <Link
                                        href={`/procurement/${selectedProject.id}`}
                                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => setIsViewMenuOpen(false)}
                                    >
                                        <Calendar className="w-4 h-4 text-amber-600" />
                                        Procurement Plan
                                    </Link>
                                    <Link
                                        href={`/scurve/${selectedProject.id}`}
                                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => setIsViewMenuOpen(false)}
                                    >
                                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                                        S-Curve Analysis
                                    </Link>
                                </div>
                            )}
                        </div>

                        {/* Share Button */}
                        <button
                            onClick={handleShareClick}
                            className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-sm hover:bg-blue-100 transition-colors flex items-center gap-1.5"
                            title="Copy View-Only Link"
                        >
                            <Share2 className="w-4 h-4 text-blue-600" />
                            Share Link
                        </button>

                        {!isReadOnly && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setAddTaskInitialData({
                                            type: 'task',
                                            planStartDate: format(new Date(), 'yyyy-MM-dd')
                                        });
                                        setShowAddTaskModal(true);
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 transition-colors shadow-sm"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Task
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {selectedProject && (
                <GanttChart
                    tasks={tasks}
                    employees={employees}
                    startDate={effectiveStartDate}
                    endDate={effectiveEndDate}
                    title={selectedProject.name}
                    viewMode={chartViewMode}
                    onViewModeChange={setChartViewMode}
                    allowedViewModes={windowMode === '4w' ? ['day'] : ['day', 'week', 'month']}
                    isFourWeekView={windowMode === '4w'}
                    isProcurementMode={isProcurementPage}
                    onTaskUpdate={isReadOnly ? undefined : handleTaskUpdate}
                    onOpenProgressModal={isReadOnly ? undefined : openProgressModal}
                    onAddSubTask={isReadOnly ? undefined : handleAddSubTask}
                    onAddTaskToCategory={isReadOnly ? undefined : handleAddTaskToCategory}
                    updatingTaskIds={updatingTaskIds}
                    procurementOffsets={procurementOffsets}
                    onProcurementOffsetsChange={setProcurementOffsets}
                    onApplyProcurementOffsetsToAll={isReadOnly ? undefined : handleApplyProcurementOffsetsToAll}
                    isApplyingOffsets={isApplyingOffsets}
                    forceExpanded={isReadOnly}
                />
            )}

            <AddTaskModal
                isOpen={showAddTaskModal}
                onClose={() => {
                    setShowAddTaskModal(false);
                    setAddTaskInitialData(undefined);
                }}
                onSave={handleAddTask}
                existingCategories={existingCategories}
                tasks={tasks}
                initialData={addTaskInitialData as never}
            />

            <ProgressUpdateModal
                isOpen={!!progressModalTask}
                onClose={() => setProgressModalTask(undefined)}
                task={progressModalTask}
                onUpdate={handleProgressUpdate}
            />

            {/* Share PIN Modal */}
            {showShareModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-3 mb-4 text-blue-600">
                            <Key className="w-6 h-6" />
                            <h3 className="text-lg font-bold text-gray-900">สร้างลิงก์แชร์โครงการ</h3>
                        </div>
                        <p className="text-sm text-gray-600 mb-6">
                            คุณสามารถตั้งรหัส PIN 6 หลักเพื่อเพิ่มความปลอดภัยให้กับการเข้าถึงข้อมูล หรือเว้นว่างไว้หากต้องการให้ใครก็เข้าดูได้
                        </p>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">รหัส PIN 6 หลัก (ไม่บังคับ)</label>
                            <input
                                type="text"
                                maxLength={6}
                                value={sharePin}
                                onChange={(e) => setSharePin(e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="เช่น 123456"
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono tracking-widest text-center text-lg"
                            />
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowShareModal(false);
                                    setSharePin('');
                                }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={copyShareLink}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                            >
                                คัดลอกลิงก์
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
