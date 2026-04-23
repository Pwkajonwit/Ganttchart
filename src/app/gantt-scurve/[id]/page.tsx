'use client';

import React, { use } from 'react';
import GanttSCurvePageClient from '@/features/gantt/presentation/routes/GanttSCurvePageClient';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default function ProjectGanttSCurvePage({ params }: PageProps) {
    const { id } = use(params);
    return <GanttSCurvePageClient preSelectedProjectId={id} />;
}
