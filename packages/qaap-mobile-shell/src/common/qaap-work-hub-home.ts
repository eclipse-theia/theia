// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { WorkHubHomeUsageSummary } from './qaap-work-hub-usage-summary';

export type WorkHubHomeRecentSurface = 'chat' | 'task';

export interface WorkHubHomeRecentSource {
    readonly id: string;
    readonly projectId: string;
    readonly projectName: string;
    readonly title: string;
    readonly subtitle: string;
    readonly surface: WorkHubHomeRecentSurface;
    readonly updatedAt: number;
}

export interface WorkHubHomeRecentItem extends WorkHubHomeRecentSource {}

export interface WorkHubHomeAttentionItem {
    readonly id: string;
    readonly kind: 'approval' | 'pull-request';
    readonly title: string;
    readonly subtitle: string;
    readonly meta?: string;
}

export interface WorkHubHomeStats {
    readonly projectCount: number;
    readonly runningTasks: number;
    readonly needsYou: number;
    readonly openPullRequests: number;
    readonly localChatCount: number;
}

export interface WorkHubHomeSnapshot {
    readonly stats: WorkHubHomeStats;
    readonly usageSummary: WorkHubHomeUsageSummary;
    readonly attentionItems: readonly WorkHubHomeAttentionItem[];
    readonly recentItems: readonly WorkHubHomeRecentItem[];
    readonly pinnedProjectIds: readonly string[];
}

export interface WorkHubHomeProjectRef {
    readonly id: string;
    readonly pinned: boolean;
    readonly isCurrent: boolean;
    readonly lastActiveAt?: string;
}

export function buildWorkHubHomeRecentItems(
    sources: readonly WorkHubHomeRecentSource[],
    limit = 5,
): WorkHubHomeRecentItem[] {
    return [...sources]
        .filter(item => item.updatedAt > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, Math.max(0, limit));
}

export function selectWorkHubHomePinnedProjectIds<T extends WorkHubHomeProjectRef>(
    projects: readonly T[],
    limit = 4,
): string[] {
    const capped = Math.max(0, limit);
    if (capped === 0 || projects.length === 0) {
        return [];
    }
    const pinned = sortProjectsByRecency(projects.filter(project => project.pinned));
    const unpinned = sortProjectsByRecency(projects.filter(project => !project.pinned));
    const currentUnpinned = unpinned.filter(project => project.isCurrent);
    const restUnpinned = unpinned.filter(project => !project.isCurrent);
    const ordered = pinned.length > 0
        ? [...pinned, ...currentUnpinned, ...restUnpinned]
        : [...projects.filter(project => project.isCurrent), ...restUnpinned];
    const unique: T[] = [];
    const seen = new Set<string>();
    for (const project of ordered) {
        if (seen.has(project.id)) {
            continue;
        }
        seen.add(project.id);
        unique.push(project);
        if (unique.length >= capped) {
            break;
        }
    }
    return unique.map(project => project.id);
}

export function buildWorkHubHomeGreeting(userName: string | undefined, now = Date.now()): string {
    const hour = new Date(now).getHours();
    const salutation = hour < 12
        ? 'Good morning'
        : hour < 18
            ? 'Good afternoon'
            : 'Good evening';
    const trimmed = userName?.trim();
    return trimmed ? `${salutation}, ${trimmed}` : salutation;
}

export function formatWorkHubRelativeTime(
    updatedAt: number,
    now = Date.now(),
    labels: {
        readonly justNow: string;
        readonly minutesAgo: (count: string) => string;
        readonly hoursAgo: (count: string) => string;
        readonly daysAgo: (count: string) => string;
    },
): string {
    if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
        return '';
    }
    const deltaMs = Math.max(0, now - updatedAt);
    const minutes = Math.floor(deltaMs / 60_000);
    if (minutes < 1) {
        return labels.justNow;
    }
    if (minutes < 60) {
        return labels.minutesAgo(String(minutes));
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 48) {
        return labels.hoursAgo(String(hours));
    }
    const days = Math.floor(hours / 24);
    return labels.daysAgo(String(days));
}

export function buildWorkHubHomeSubtitle(stats: WorkHubHomeStats): string {
    if (stats.needsYou > 0) {
        return stats.needsYou === 1
            ? '1 item needs your attention'
            : `${stats.needsYou} items need your attention`;
    }
    if (stats.runningTasks > 0) {
        return stats.runningTasks === 1
            ? '1 agent moving work toward PR'
            : `${stats.runningTasks} agents moving work toward PR`;
    }
    if (stats.openPullRequests > 0) {
        return stats.openPullRequests === 1
            ? '1 pull request ready to review'
            : `${stats.openPullRequests} pull requests ready to review`;
    }
    if (stats.projectCount === 0) {
        return 'Add a GitHub repository to start agent work';
    }
    return 'Ready to capture the next task';
}

function sortProjectsByRecency<T extends WorkHubHomeProjectRef>(projects: readonly T[]): T[] {
    return [...projects].sort((a, b) => projectRecency(b) - projectRecency(a));
}

function projectRecency(project: WorkHubHomeProjectRef): number {
    if (project.lastActiveAt) {
        const parsed = Date.parse(project.lastActiveAt);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    return 0;
}
