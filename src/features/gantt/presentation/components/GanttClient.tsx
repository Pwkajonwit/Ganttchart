'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import GanttChart from '@/components/charts/gantt/GanttChart';
import { Calendar, Loader2, FolderKanban, Plus, FileUp, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Project, Task, Employee } from '@/types/construction';
import { getProjects, getTasks, updateTask, createTask, getEmployees } from '@/lib/firestore';
import { format, parseISO, addDays, startOfWeek, endOfWeek, subWeeks, addWeeks } from 'date-fns';
import AddTaskModal from '@/components/gantt/modals/AddTaskModal';
import ProgressUpdateModal from '@/components/gantt/modals/ProgressUpdateModal';
import { ViewMode } from '@/shared/chart-kernel/types';

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

    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [chartViewMode, setChartViewMode] = useState<ViewMode>('day');
    const [importing, setImporting] = useState(false);
    const importInputRef = React.useRef<HTMLInputElement | null>(null);

    const [showAddTaskModal, setShowAddTaskModal] = useState(false);
    const [addTaskInitialData, setAddTaskInitialData] = useState<Record<string, unknown> | undefined>(undefined);
    const [progressModalTask, setProgressModalTask] = useState<Task | undefined>(undefined);
    const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(new Set());

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

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedProjectId) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('Please select a CSV file only.');
            e.target.value = '';
            return;
        }

        if (!confirm(`Import tasks into project "${selectedProject?.name}"?`)) {
            e.target.value = '';
            return;
        }

        setImporting(true);
        try {
            const text = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (evt) => resolve(String(evt.target?.result || ''));
                reader.onerror = reject;
                reader.readAsText(file, 'UTF-8');
            });

            const { parseCSV } = await import('@/lib/csv-utils');
            const data = parseCSV(text);
            if (data.length === 0) throw new Error('File is empty or invalid');

            const { batchCreateTasks, getNewTaskId } = await import('@/lib/firestore');

            let activeGroup: { id: string; category: string } | null = null;
            let count = 0;
            const currentMaxOrder = tasks.length > 0 ? Math.max(...tasks.map((t) => t.order || 0)) : 0;
            let lastTaskId: string | null = tasks.length > 0 ? tasks[tasks.length - 1].id : null;
            const tasksToCreate: Array<Record<string, unknown>> = [];

            for (const row of data) {
                const name = row['Task Name'] || row['Task'] || row['Name'] || row['name'];
                if (!name) continue;

                const category = row['Category'] || 'Imported';
                const subcategory = row['Subcategory'] || row['Sub Category'] || '';
                const subsubcategory = row['SubSubcategory'] || row['Sub Subcategory'] || '';

                const parseDateString = (val: string): string | null => {
                    if (!val || val === '-' || val.trim() === '') return null;
                    const cleaned = val.trim();
                    if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned;
                    if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
                        const [day, month, year] = cleaned.split('/');
                        return `${year}-${month}-${day}`;
                    }
                    if (/^\d{2}\/\d{2}\/\d{2}$/.test(cleaned)) {
                        const [day, month, year] = cleaned.split('/');
                        const fullYear = parseInt(year, 10) < 50 ? `20${year}` : `19${year}`;
                        return `${fullYear}-${month}-${day}`;
                    }
                    const d = new Date(cleaned);
                    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
                    return null;
                };

                const duration = parseInt(String(row['Duration'] || row['Duration (Days)'] || '1'), 10) || 1;
                let planStart = parseDateString(String(row['Plan Start'] || row['Start'] || ''));
                if (!planStart) planStart = format(new Date(), 'yyyy-MM-dd');

                const startDateParams = parseISO(planStart);
                const endDateParams = addDays(startDateParams, duration - 1);
                const planEnd = format(endDateParams, 'yyyy-MM-dd');

                const type = (String(row['Type'] || '').toLowerCase() === 'group' ? 'group' : 'task') as 'group' | 'task';
                const newTaskId = getNewTaskId();

                let parentId: string | undefined = undefined;
                if (type === 'group') {
                    activeGroup = { id: newTaskId, category };
                } else if (activeGroup && activeGroup.category === category) {
                    parentId = activeGroup.id;
                } else {
                    activeGroup = null;
                }

                const predecessors = (lastTaskId && type !== 'group') ? [lastTaskId] : undefined;

                tasksToCreate.push({
                    id: newTaskId,
                    name,
                    category,
                    subcategory: subcategory || undefined,
                    subsubcategory: subsubcategory || undefined,
                    planStartDate: planStart,
                    planEndDate: planEnd,
                    planDuration: duration,
                    cost: parseFloat(String(row['Cost'] || '0')) || 0,
                    quantity: row['Quantity'] || undefined,
                    responsible: row['Responsible'] || undefined,
                    progress: parseFloat(String(row['Progress'] || row['Progress (%)'] || '0')) || 0,
                    status: 'not-started',
                    order: currentMaxOrder + count + 1,
                    type,
                    parentTaskId: parentId,
                    predecessors
                });

                if (type !== 'group') lastTaskId = newTaskId;
                count++;
            }

            const chunkSize = 450;
            for (let i = 0; i < tasksToCreate.length; i += chunkSize) {
                const chunk = tasksToCreate.slice(i, i + chunkSize);
                await batchCreateTasks(selectedProjectId, chunk as never);
            }

            alert(`Import completed: ${count} records.`);
            fetchTasks();
        } catch (error) {
            console.error('Import error:', error);
            alert('Import failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
        } finally {
            setImporting(false);
            e.target.value = '';
        }
    };

    const handleExport = () => {
        if (tasks.length === 0) return;

        const headers = [
            'Category',
            'Subcategory',
            'SubSubcategory',
            'Type',
            'Task Name',
            'Plan Start',
            'Plan End',
            'Duration (Days)',
            'Cost',
            'Quantity',
            'Responsible',
            'Progress (%)',
            'Status',
            'Actual Start',
            'Actual End'
        ];

        const instructionRow = [
            'Category',
            'Subcategory',
            'Subsubcategory',
            'Type (task/group)',
            'Task Name',
            'Plan Start',
            'Plan End',
            'Duration (Days)',
            'Cost',
            'Quantity',
            'Responsible',
            'Progress',
            'Status',
            'Actual Start',
            'Actual End'
        ];

        const rows = tasks.map((task) => ([
            `"${(task.category || '').replace(/"/g, '""')}"`,
            `"${(task.subcategory || '').replace(/"/g, '""')}"`,
            `"${(task.subsubcategory || '').replace(/"/g, '""')}"`,
            task.type || 'task',
            `"${(task.name || '').replace(/"/g, '""')}"`,
            task.planStartDate,
            task.planEndDate,
            task.planDuration || 0,
            task.cost || 0,
            `"${(task.quantity || '').replace(/"/g, '""')}"`,
            `"${(task.responsible || '').replace(/"/g, '""')}"`,
            task.progress || 0,
            task.status || 'not-started',
            task.actualStartDate || '-',
            task.actualEndDate || '-'
        ].join(',')));

        const csvContent = '\uFEFF' + [headers.join(','), instructionRow.map((cell) => `"${cell}"`).join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gantt_export_${selectedProject?.name || 'project'}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

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

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-2 text-gray-500">Loading data...</span>
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
                <div className="gantt-page-header flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                            <Calendar className="w-6 h-6 text-blue-600" />
                            {pageTitle}
                        </h1>
                        <p className="text-gray-500 text-sm mt-0.5">{pageSubtitle}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <button
                            type="button"
                            onClick={() => {
                                setAddTaskInitialData({
                                    type: 'task',
                                    planStartDate: format(new Date(), 'yyyy-MM-dd')
                                });
                                setShowAddTaskModal(true);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add Task
                        </button>

                        <input
                            ref={importInputRef}
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportFile}
                        />
                        <button
                            type="button"
                            onClick={() => importInputRef.current?.click()}
                            disabled={importing}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-60 transition-colors"
                        >
                            <FileUp className="w-4 h-4" />
                            {importing ? 'Importing...' : 'Import'}
                        </button>

                        <button
                            type="button"
                            onClick={handleExport}
                            className="px-4 py-2 text-sm font-medium text-gray-800 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        >
                            Export CSV
                        </button>

                        <Link
                            href={`/scurve?project=${selectedProject.id}`}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 bg-white border border-emerald-200 rounded hover:bg-emerald-50 transition-colors"
                        >
                            <TrendingUp className="w-4 h-4" />
                            S-Curve
                        </Link>

                        {!isProcurementPage && (
                            <Link
                                href={`/procurement/${selectedProject.id}`}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-white border border-amber-200 rounded hover:bg-amber-50 transition-colors"
                            >
                                <Calendar className="w-4 h-4" />
                                Procurement
                            </Link>
                        )}

                        <Link
                            href={`/gantt-4w/${selectedProject.id}`}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 bg-white border border-indigo-200 rounded hover:bg-indigo-50 transition-colors"
                        >
                            <Calendar className="w-4 h-4" />
                            4 Week
                        </Link>

                        <Link
                            href={`/projects/${selectedProject.id}`}
                            className="px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded hover:bg-blue-50 transition-colors"
                        >
                            View Details →
                        </Link>
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
                    onTaskUpdate={handleTaskUpdate}
                    onOpenProgressModal={openProgressModal}
                    onAddSubTask={handleAddSubTask}
                    onAddTaskToCategory={handleAddTaskToCategory}
                    updatingTaskIds={updatingTaskIds}
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
        </div>
    );
}
