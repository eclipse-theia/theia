// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { LabelProvider } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { SingleTextInputDialog } from '@theia/core/lib/browser/dialogs';
import { nls } from '@theia/core/lib/common/nls';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    MobileProjectEntry,
    MobileProjectFilter,
    mobileProjectColorForName,
    mobileProjectInitials,
    StoredMobileProject,
} from './mobile-projects-types';
import { markMobileProjectReadmeForOpen } from './mobile-projects-open';

const HIDDEN_PROJECT_IDS_STORAGE_KEY = 'qaap.mobileProjects.hiddenIds';
const PINNED_PROJECT_IDS_STORAGE_KEY = 'qaap.mobileProjects.pinnedIds';
const DISPLAY_NAMES_STORAGE_KEY = 'qaap.mobileProjects.displayNames';
const CUSTOM_PROJECTS_STORAGE_KEY = 'qaap.mobileProjects.customProjects';

const DEMO_PROJECTS: Omit<MobileProjectEntry, 'uri' | 'isCurrent'>[] = [
    {
        id: 'demo-gem',
        name: 'gem-store-web',
        branch: 'feat/oauth-google',
        status: 'working',
        task: 'Adding Google OAuth flow',
        progress: 0.62,
        agents: [
            { role: 'fe', color: '#3B6FA0' },
            { role: 'be', color: '#5A4A86' },
            { role: 'qa', color: '#6E8C4F' },
        ],
        lastActive: 'now',
        tokens: '12.4k',
        cost: '$0.41',
        pinned: true,
        color: '#E5A894',
    },
    {
        id: 'demo-orb',
        name: 'orbital-api',
        color: '#8EB5DC',
        branch: 'main',
        status: 'review',
        task: '3 PRs waiting on you',
        progress: 0,
        agents: [{ role: 'orch', color: '#D97757' }],
        lastActive: '12 min',
        tokens: '—',
        cost: '—',
        pinned: true,
    },
];

@injectable()
export class MobileProjectsService {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    protected filter: MobileProjectFilter = 'all';

    protected readHiddenProjectIds(): Set<string> {
        if (typeof localStorage === 'undefined') {
            return new Set();
        }
        try {
            const raw = localStorage.getItem(HIDDEN_PROJECT_IDS_STORAGE_KEY);
            if (!raw) {
                return new Set();
            }
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) {
                return new Set();
            }
            return new Set(parsed.filter((id): id is string => typeof id === 'string'));
        } catch {
            return new Set();
        }
    }

    protected writeHiddenProjectIds(ids: Set<string>): void {
        if (typeof localStorage === 'undefined') {
            return;
        }
        localStorage.setItem(HIDDEN_PROJECT_IDS_STORAGE_KEY, JSON.stringify([...ids]));
    }

    protected readPinnedProjectIds(): Set<string> {
        if (typeof localStorage === 'undefined') {
            return new Set();
        }
        try {
            const raw = localStorage.getItem(PINNED_PROJECT_IDS_STORAGE_KEY);
            if (!raw) {
                return new Set();
            }
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) {
                return new Set();
            }
            return new Set(parsed.filter((id): id is string => typeof id === 'string'));
        } catch {
            return new Set();
        }
    }

    protected writePinnedProjectIds(ids: Set<string>): void {
        if (typeof localStorage === 'undefined') {
            return;
        }
        localStorage.setItem(PINNED_PROJECT_IDS_STORAGE_KEY, JSON.stringify([...ids]));
    }

    protected isPinned(id: string, pinnedIds: Set<string>, defaultPinned: boolean): boolean {
        if (pinnedIds.has(id)) {
            return true;
        }
        if (pinnedIds.has(`!${id}`)) {
            return false;
        }
        return defaultPinned;
    }

    togglePin(project: MobileProjectEntry): boolean {
        const pinnedIds = this.readPinnedProjectIds();
        const nextPinned = !project.pinned;
        pinnedIds.delete(project.id);
        pinnedIds.delete(`!${project.id}`);
        if (nextPinned) {
            pinnedIds.add(project.id);
        } else {
            pinnedIds.add(`!${project.id}`);
        }
        this.writePinnedProjectIds(pinnedIds);
        return nextPinned;
    }

    canOpenInNewWindow(project: MobileProjectEntry): boolean {
        return !!project.uri;
    }

    protected workspacePathFromUri(uri: URI): string {
        return uri.authority
            ? `//${uri.authority}${uri.path.toString()}`
            : uri.path.toString();
    }

    openWorkspaceUri(uri: URI): void {
        markMobileProjectReadmeForOpen();
        const url = new URL(window.location.href);
        url.hash = encodeURI(this.workspacePathFromUri(uri));
        window.location.replace(url.toString());
    }

    openInCurrentWindow(project: MobileProjectEntry): void {
        if (!project.uri) {
            return;
        }
        this.openWorkspaceUri(project.uri);
    }

    openInNewWindow(project: MobileProjectEntry): void {
        if (!project.uri) {
            return;
        }
        markMobileProjectReadmeForOpen();
        const url = new URL(window.location.href);
        url.hash = encodeURI(this.workspacePathFromUri(project.uri));
        this.windowService.openNewWindow(url.toString());
    }

    protected readDisplayNames(): Record<string, string> {
        if (typeof localStorage === 'undefined') {
            return {};
        }
        try {
            const raw = localStorage.getItem(DISPLAY_NAMES_STORAGE_KEY);
            if (!raw) {
                return {};
            }
            const parsed = JSON.parse(raw) as unknown;
            if (!parsed || typeof parsed !== 'object') {
                return {};
            }
            return parsed as Record<string, string>;
        } catch {
            return {};
        }
    }

    protected writeDisplayNames(names: Record<string, string>): void {
        if (typeof localStorage === 'undefined') {
            return;
        }
        localStorage.setItem(DISPLAY_NAMES_STORAGE_KEY, JSON.stringify(names));
    }

    protected readCustomProjects(): StoredMobileProject[] {
        if (typeof localStorage === 'undefined') {
            return [];
        }
        try {
            const raw = localStorage.getItem(CUSTOM_PROJECTS_STORAGE_KEY);
            if (!raw) {
                return [];
            }
            const parsed = JSON.parse(raw) as unknown;
            return Array.isArray(parsed) ? parsed as StoredMobileProject[] : [];
        } catch {
            return [];
        }
    }

    protected writeCustomProjects(projects: StoredMobileProject[]): void {
        if (typeof localStorage === 'undefined') {
            return;
        }
        localStorage.setItem(CUSTOM_PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    }

    protected resolveDisplayName(id: string, defaultName: string): string {
        const override = this.readDisplayNames()[id];
        return override?.trim() || defaultName;
    }

    protected storedToEntry(stored: StoredMobileProject, pinnedIds: Set<string>): MobileProjectEntry {
        return {
            id: stored.id,
            name: stored.name,
            color: stored.color,
            branch: stored.branch,
            status: stored.status,
            task: stored.task,
            progress: stored.progress,
            agents: stored.agents,
            lastActive: stored.lastActive,
            tokens: stored.tokens,
            cost: stored.cost,
            pinned: this.isPinned(stored.id, pinnedIds, stored.pinned),
            uri: stored.uri ? new URI(stored.uri) : undefined,
            isCurrent: false,
        };
    }

    protected uniqueCopyName(base: string, existingNames: string[]): string {
        const trimmed = base.trim() || nls.localize('qaap/mobileProjects/untitled', 'Project');
        if (!existingNames.includes(trimmed)) {
            return trimmed;
        }
        let i = 2;
        while (existingNames.includes(`${trimmed} (${i})`)) {
            i++;
        }
        return `${trimmed} (${i})`;
    }

    async renameProject(project: MobileProjectEntry): Promise<boolean> {
        const dialog = new SingleTextInputDialog({
            title: nls.localize('qaap/mobileProjects/rename', 'Rename project'),
            initialValue: project.name,
            placeholder: nls.localize('qaap/mobileProjects/renamePlaceholder', 'Project name'),
            validate: (value, mode) => {
                if (mode !== 'preview' && !value.trim()) {
                    return nls.localize('qaap/mobileProjects/renameRequired', 'Enter a project name');
                }
                return true;
            },
        });
        const value = await dialog.open();
        const newName = value?.trim();
        if (!newName) {
            return false;
        }
        if (project.id.startsWith('custom:')) {
            const custom = this.readCustomProjects();
            const index = custom.findIndex(p => p.id === project.id);
            if (index < 0) {
                return false;
            }
            custom[index] = { ...custom[index], name: newName };
            this.writeCustomProjects(custom);
            return true;
        }
        const names = this.readDisplayNames();
        names[project.id] = newName;
        this.writeDisplayNames(names);
        return true;
    }

    async duplicateProject(project: MobileProjectEntry): Promise<boolean> {
        const custom = this.readCustomProjects();
        const allNames = [
            ...custom.map(p => p.name),
            ...(await this.loadProjects()).map(p => p.name),
        ];
        const copyName = this.uniqueCopyName(
            nls.localize('qaap/mobileProjects/copyOf', '{0} copy', project.name),
            allNames
        );
        const id = `custom:${Date.now()}`;
        const status = project.isCurrent ? 'idle' : project.status;
        custom.push({
            id,
            name: copyName,
            color: mobileProjectColorForName(copyName),
            branch: project.branch,
            status,
            task: project.task,
            progress: project.progress,
            agents: project.agents.map(a => ({ ...a })),
            lastActive: project.lastActive !== '—' ? project.lastActive : '—',
            tokens: project.tokens,
            cost: project.cost,
            pinned: false,
            uri: project.uri?.toString(),
        });
        this.writeCustomProjects(custom);
        return true;
    }

    canRemove(project: MobileProjectEntry): boolean {
        return !project.isCurrent;
    }

    async removeProject(project: MobileProjectEntry): Promise<boolean> {
        if (!this.canRemove(project)) {
            return false;
        }
        if (project.id.startsWith('custom:')) {
            const custom = this.readCustomProjects().filter(p => p.id !== project.id);
            this.writeCustomProjects(custom);
            const names = this.readDisplayNames();
            delete names[project.id];
            this.writeDisplayNames(names);
            return true;
        }
        if (project.id.startsWith('demo-')) {
            const hidden = this.readHiddenProjectIds();
            hidden.add(project.id);
            this.writeHiddenProjectIds(hidden);
            return true;
        }
        if (project.uri) {
            await this.workspaceService.removeRecentWorkspace(project.uri.toString());
            return true;
        }
        return false;
    }

    getFilter(): MobileProjectFilter {
        return this.filter;
    }

    setFilter(filter: MobileProjectFilter): void {
        this.filter = filter;
    }

    async loadProjects(): Promise<MobileProjectEntry[]> {
        const entries: MobileProjectEntry[] = [];
        const seen = new Set<string>();
        const hiddenIds = this.readHiddenProjectIds();
        const pinnedIds = this.readPinnedProjectIds();

        const current = this.workspaceService.workspace;
        if (current) {
            const uri = current.resource;
            const name = this.labelProvider.getName(uri);
            const id = `ws:${uri.toString()}`;
            entries.push({
                id,
                name: this.resolveDisplayName(id, name),
                color: mobileProjectColorForName(name),
                branch: uri.path.base,
                status: 'working',
                task: nls.localize('qaap/mobileProjects/currentTask', 'Active workspace'),
                progress: 0.35,
                agents: [{ role: 'ai', color: '#3B6FA0' }],
                lastActive: nls.localize('qaap/mobileProjects/lastActiveNow', 'now'),
                tokens: '—',
                cost: '—',
                pinned: this.isPinned(id, pinnedIds, true),
                uri,
                isCurrent: true,
            });
            seen.add(uri.toString());
        }

        try {
            const recent = await this.workspaceService.recentWorkspaces();
            for (const path of recent) {
                const uri = new URI(path);
                const key = uri.toString();
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                const name = this.labelProvider.getName(uri);
                const id = `recent:${key}`;
                entries.push({
                    id,
                    name: this.resolveDisplayName(id, name),
                    color: mobileProjectColorForName(name),
                    branch: uri.path.base,
                    status: 'idle',
                    task: nls.localize('qaap/mobileProjects/recentTask', 'Tap to open workspace'),
                    progress: 0,
                    agents: [],
                    lastActive: '—',
                    tokens: '—',
                    cost: '—',
                    pinned: this.isPinned(id, pinnedIds, false),
                    uri,
                    isCurrent: false,
                });
            }
        } catch {
            /* recent list optional */
        }

        for (const stored of this.readCustomProjects()) {
            if (hiddenIds.has(stored.id) || entries.some(e => e.id === stored.id)) {
                continue;
            }
            entries.push(this.storedToEntry(stored, pinnedIds));
        }

        if (entries.length <= 1) {
            for (const demo of DEMO_PROJECTS) {
                if (hiddenIds.has(demo.id)) {
                    continue;
                }
                if (!entries.some(e => e.name === demo.name)) {
                    entries.push({
                        ...demo,
                        name: this.resolveDisplayName(demo.id, demo.name),
                        uri: undefined,
                        isCurrent: false,
                        pinned: this.isPinned(demo.id, pinnedIds, demo.pinned),
                    });
                }
            }
        }

        return entries.filter(p => !hiddenIds.has(p.id));
    }

    filterProjects(projects: MobileProjectEntry[], filter: MobileProjectFilter): MobileProjectEntry[] {
        if (filter === 'active') {
            return projects.filter(p => p.status === 'working' || p.status === 'review');
        }
        if (filter === 'pinned') {
            return projects.filter(p => p.pinned);
        }
        return projects;
    }

    countActive(projects: MobileProjectEntry[]): number {
        return projects.filter(p => p.status === 'working' || p.status === 'review').length;
    }

    getInitials(name: string): string {
        return mobileProjectInitials(name);
    }
}
