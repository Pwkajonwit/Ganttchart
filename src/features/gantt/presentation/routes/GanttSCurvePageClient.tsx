'use client';

import React from 'react';
import GanttClient from '@/features/gantt/presentation/components/GanttClient';

export default function GanttSCurvePageClient({ preSelectedProjectId }: { preSelectedProjectId?: string }) {
    return (
        <GanttClient
            preSelectedProjectId={preSelectedProjectId}
            showSCurveOverlay={true}
            pageTitle="Gantt & S-Curve"
            pageSubtitle="Integrated project timeline with S-Curve progress tracking"
        />
    );
}
