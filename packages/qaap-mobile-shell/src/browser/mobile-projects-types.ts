// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import URI from '@theia/core/lib/common/uri';

export type MobileProjectStatus = 'working' | 'review' | 'idle' | 'sleeping';

export interface MobileProjectAgent {
    role: string;
    color: string;
}

export interface MobileProjectEntry {
    id: string;
    name: string;
    color: string;
    branch: string;
    status: MobileProjectStatus;
    task: string;
    progress: number;
    agents: MobileProjectAgent[];
    lastActive: string;
    tokens: string;
    cost: string;
    pinned: boolean;
    uri?: URI;
    isCurrent: boolean;
}

export type MobileProjectFilter = 'all' | 'active' | 'pinned';

/** Persisted clone of a project card (URI optional). */
export interface StoredMobileProject {
    id: string;
    name: string;
    color: string;
    branch: string;
    status: MobileProjectStatus;
    task: string;
    progress: number;
    agents: MobileProjectAgent[];
    lastActive: string;
    tokens: string;
    cost: string;
    pinned: boolean;
    uri?: string;
}

export const MOBILE_PROJECT_STATUS_COLORS: Record<MobileProjectStatus, { color: string; bg: string; labelKey: string; defaultLabel: string }> = {
    working: { color: 'var(--theia-activityBarBadge-background, #d97757)', bg: 'color-mix(in srgb, var(--theia-activityBarBadge-background, #d97757) 18%, transparent)', labelKey: 'qaap/mobileProjects/status/working', defaultLabel: 'Working' },
    review: { color: '#8E2F1F', bg: '#F8E5DF', labelKey: 'qaap/mobileProjects/status/review', defaultLabel: 'Needs review' },
    idle: { color: '#28663F', bg: '#EEF6EE', labelKey: 'qaap/mobileProjects/status/idle', defaultLabel: 'Idle · ready' },
    sleeping: { color: 'var(--theia-descriptionForeground)', bg: 'var(--theia-toolbar-hoverBackground)', labelKey: 'qaap/mobileProjects/status/sleeping', defaultLabel: 'Sleeping' },
};

/** Soft but visible accents (lighter than the original saturated palette). */
export const MOBILE_PROJECT_PALETTE = ['#E5A894', '#8EB5DC', '#AFA0C8', '#A8C48E', '#B5B0A6', '#C4B4A6'];

export function mobileProjectInitials(name: string): string {
    const parts = name.split(/[-_.\s]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

export function mobileProjectColorForName(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash |= 0;
    }
    return MOBILE_PROJECT_PALETTE[Math.abs(hash) % MOBILE_PROJECT_PALETTE.length];
}
