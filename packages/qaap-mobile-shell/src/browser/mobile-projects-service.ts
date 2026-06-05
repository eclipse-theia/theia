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
import { MessageService } from '@theia/core/lib/common/message-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    cloneQaapGithubRepository,
    createQaapGithubRepository,
    fetchQaapAuthConfig,
    fetchQaapGithubRepositories,
    fetchQaapProjectSessions,
    openQaapGithubRepository,
    syncQaapAuthSessionFromServer,
    upsertQaapProjectSession,
} from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import type {
    QaapProjectSessionSummary,
    QaapProjectSessionUpsertRequest,
} from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import { readQaapAuthUser, readQaapSignedIn, type QaapAuthUser } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import type { QaapGithubRepositorySummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import {
    MobileProjectEntry,
    MobileProjectFilter,
    MobileProjectsHubView,
    mobileProjectColorForName,
    mobileProjectInitials,
    StoredMobileProject,
} from './mobile-projects-types';
import { normalizeWorkHubViewId } from '../common/qaap-work-hub-surfaces';
import { MobileProjectsActiveTasks } from './mobile-projects-active-tasks';
import {
    clearMobileProjectReadmeOpenRequest,
    markMobileProjectReadmeForOpen,
    markMobileProjectsPanelDismiss,
    requestMobileProjectsPanelDismiss,
} from './mobile-projects-open';
import { MobileSnackbar } from './mobile-snackbar';
import {
    mergeSessionMaps,
    patchLocalProjectSession,
    readLocalProjectSessions,
    writeLocalProjectSessions,
} from './mobile-projects-session-cache';

const HIDDEN_PROJECT_IDS_STORAGE_KEY = 'qaap.mobileProjects.hiddenIds';
const PINNED_PROJECT_IDS_STORAGE_KEY = 'qaap.mobileProjects.pinnedIds';
const DISPLAY_NAMES_STORAGE_KEY = 'qaap.mobileProjects.displayNames';
const CUSTOM_PROJECTS_STORAGE_KEY = 'qaap.mobileProjects.customProjects';

@injectable()
export class MobileProjectsService {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(WindowService)
    protected readonly windowService: WindowService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(MobileProjectsActiveTasks)
    protected readonly activeTasks: MobileProjectsActiveTasks;

    protected filter: MobileProjectFilter = 'all';
    protected hubView: MobileProjectsHubView = 'tasks';

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
        return !!project.uri || !!project.github;
    }

    protected workspacePathFromUri(uri: URI): string {
        return uri.authority
            ? `//${uri.authority}${uri.path.toString()}`
            : uri.path.toString();
    }

    openWorkspaceUri(uri: URI): void {
        this.touchWorkspaceActivity(uri);
        requestMobileProjectsPanelDismiss();
        markMobileProjectReadmeForOpen();
        this.workspaceService.open(uri, { preserveWindow: true });
    }

    protected formatRepositoryLabel(repository: string): string {
        const trimmed = repository.trim().replace(/\.git$/, '');
        try {
            const url = new URL(trimmed);
            if (url.hostname.toLowerCase() === 'github.com') {
                const segments = url.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
                if (segments.length >= 2) {
                    return `${segments[0]}/${segments[1]}`;
                }
            }
        } catch {
            /* owner/repo */
        }
        return trimmed;
    }

    openInCurrentWindow(project: MobileProjectEntry): void {
        void this.openInCurrentWindowAsync(project);
    }

    /** Opens the project in this browser tab; awaits GitHub clone/prepare when needed. */
    async openInCurrentWindowAsync(project: MobileProjectEntry): Promise<void> {
        markMobileProjectsPanelDismiss();
        if (project.github) {
            await this.openGithubProject(project);
            return;
        }
        if (project.uri) {
            this.touchProjectActivity(project);
            this.openWorkspaceUri(project.uri);
        }
    }

    openInNewWindow(project: MobileProjectEntry): void {
        if (project.github) {
            void this.openGithubProject(project, true);
            return;
        }
        if (!project.uri) {
            return;
        }
        this.touchProjectActivity(project);
        markMobileProjectReadmeForOpen();
        const url = new URL(window.location.href);
        url.hash = encodeURI(this.workspacePathFromUri(project.uri));
        this.windowService.openNewWindow(url.toString());
    }

    protected async openGithubProject(project: MobileProjectEntry, newWindow = false): Promise<void> {
        if (!project.github) {
            return;
        }
        markMobileProjectReadmeForOpen();
        const label = project.github.fullName;
        MobileSnackbar.show(
            nls.localize('qaap/mobileProjects/openingRepo', 'Opening {0}…', label),
            { kind: 'loading' }
        );
        try {
            const result = await openQaapGithubRepository(project.github.owner, project.github.name);
            const uri = new URI(result.workspaceUri);
            this.touchGithubRepositoryActivity(result.repository);
            if (newWindow) {
                MobileSnackbar.dismiss();
                const url = new URL(window.location.href);
                url.hash = encodeURI(this.workspacePathFromUri(uri));
                this.windowService.openNewWindow(url.toString());
                return;
            }
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/repoOpened', 'Opened {0}', result.repository.fullName),
                { kind: 'success', duration: 2400 }
            );
            this.openWorkspaceUri(uri);
        } catch (err) {
            MobileSnackbar.dismiss();
            // Without this, the backend error (e.g. failed clone, missing workspace root) is silently
            // dropped on the floor and the user sees the project tap as a no-op.
            clearMobileProjectReadmeOpenRequest();
            const detail = err instanceof Error ? err.message : String(err);
            await this.messageService.error(
                nls.localize(
                    'qaap/mobileProjects/openGithubFailed',
                    'Could not open {0}: {1}',
                    project.github.fullName,
                    detail
                )
            );
        }
    }

    async createGithubProject(): Promise<MobileProjectEntry[] | undefined> {
        const dialog = new SingleTextInputDialog({
            title: nls.localize('qaap/mobileProjects/createGithubRepo', 'Create GitHub repository'),
            placeholder: nls.localize('qaap/mobileProjects/createGithubRepoPlaceholder', 'repository-name'),
            validate: (value, mode) => {
                const name = value.trim();
                if (mode !== 'preview' && !name) {
                    return nls.localize('qaap/mobileProjects/createGithubRepoRequired', 'Enter a repository name');
                }
                if (name && (!/^[A-Za-z0-9_.-]+$/.test(name) || name.startsWith('.'))) {
                    return nls.localize('qaap/mobileProjects/createGithubRepoInvalid', 'Use letters, numbers, dashes, underscores, or dots');
                }
                return true;
            },
        });
        const name = (await dialog.open())?.trim();
        if (!name) {
            return undefined;
        }
        MobileSnackbar.show(
            nls.localize('qaap/mobileProjects/creatingRepo', 'Creating {0}…', name),
            { kind: 'loading' }
        );
        try {
            const result = await createQaapGithubRepository({ name, private: true });
            this.registerGithubWorkspaceProject(result.repository, new URI(result.workspaceUri));
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/repoCreated', 'Created {0}', result.repository.fullName),
                { kind: 'success', duration: 2400 }
            );
            return this.loadProjects();
        } catch (err) {
            MobileSnackbar.dismiss();
            await this.messageService.error(err instanceof Error ? err.message : String(err));
            return undefined;
        }
    }

    async cloneGithubProject(): Promise<MobileProjectEntry[] | undefined> {
        const dialog = new SingleTextInputDialog({
            title: nls.localize('qaap/mobileProjects/cloneGithubRepo', 'Clone GitHub repository'),
            placeholder: nls.localize('qaap/mobileProjects/cloneGithubRepoPlaceholder', 'owner/repo or https://github.com/owner/repo'),
            validate: (value, mode) => {
                if (mode !== 'preview' && !value.trim()) {
                    return nls.localize('qaap/mobileProjects/cloneGithubRepoRequired', 'Enter a GitHub repository');
                }
                return true;
            },
        });
        const repository = (await dialog.open())?.trim();
        if (!repository) {
            return undefined;
        }
        return this.cloneGithubProjectByRepository(repository);
    }

    async cloneGithubProjectByRepository(repository: string): Promise<MobileProjectEntry[] | undefined> {
        const trimmed = repository.trim();
        if (!trimmed) {
            return undefined;
        }
        const label = this.formatRepositoryLabel(trimmed);
        MobileSnackbar.show(
            nls.localize('qaap/mobileProjects/cloningRepo', 'Cloning {0}…', label),
            { kind: 'loading' }
        );
        try {
            const result = await cloneQaapGithubRepository(trimmed);
            this.registerGithubWorkspaceProject(result.repository, new URI(result.workspaceUri));
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/repoCloned', 'Cloned {0}', result.repository.fullName),
                { kind: 'success', duration: 2400 }
            );
            return this.loadProjects();
        } catch (err) {
            MobileSnackbar.dismiss();
            await this.messageService.error(err instanceof Error ? err.message : String(err));
            return undefined;
        }
    }

    /** Profile of the currently signed-in GitHub user, when known. */
    getConnectedUser(): QaapAuthUser | undefined {
        return readQaapAuthUser();
    }

    /** Public access to the list of GitHub repositories visible to the signed-in user. */
    async listGithubRepositories(): Promise<MobileProjectEntry[]> {
        const sessionMap = await this.loadSessionMap();
        return this.sortProjectsByRecent(await this.loadGithubProjects(sessionMap, true));
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

    async importGithubProject(project: MobileProjectEntry): Promise<MobileProjectEntry[] | undefined> {
        if (!project.github) {
            return undefined;
        }
        MobileSnackbar.show(
            nls.localize('qaap/mobileProjects/importingRepo', 'Importing {0}…', project.github.fullName),
            { kind: 'loading' }
        );
        try {
            const result = await openQaapGithubRepository(project.github.owner, project.github.name);
            this.registerGithubWorkspaceProject(result.repository, new URI(result.workspaceUri));
            MobileSnackbar.show(
                nls.localize('qaap/mobileProjects/repoImported', 'Imported {0}', result.repository.fullName),
                { kind: 'success', duration: 2400 }
            );
            return this.loadProjects();
        } catch (err) {
            MobileSnackbar.dismiss();
            await this.messageService.error(err instanceof Error ? err.message : String(err));
            return undefined;
        }
    }

    protected registerGithubWorkspaceProject(repository: QaapGithubRepositorySummary, uri: URI): void {
        this.touchGithubRepositoryActivity(repository);
        const custom = this.readCustomProjects();
        const id = `custom:${uri.toString()}`;
        const existing = custom.findIndex(project => project.id === id || project.uri === uri.toString());
        const entry: StoredMobileProject = {
            id,
            name: repository.name,
            color: mobileProjectColorForName(repository.fullName),
            branch: repository.defaultBranch,
            status: 'idle',
            task: nls.localize('qaap/mobileProjects/recentTask', 'Tap to open workspace'),
            progress: 0,
            agents: [],
            lastActive: this.relativeUpdatedAt(new Date().toISOString()),
            lastActiveAt: new Date().toISOString(),
            tokens: '—',
            cost: '—',
            pinned: false,
            uri: uri.toString(),
        };
        if (existing >= 0) {
            custom[existing] = { ...custom[existing], ...entry, pinned: custom[existing].pinned };
        } else {
            custom.push(entry);
        }
        this.writeCustomProjects(custom);
        // If the repo was previously hidden (same workspace URI/id), unhide it so create/import
        // actions always surface it immediately in Work Hub.
        const hiddenIds = this.readHiddenProjectIds();
        if (hiddenIds.delete(id)) {
            this.writeHiddenProjectIds(hiddenIds);
        }
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
            lastActiveAt: stored.lastActiveAt,
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
            lastActiveAt: project.lastActiveAt,
            tokens: project.tokens,
            cost: project.cost,
            pinned: false,
            uri: project.uri?.toString(),
        });
        this.writeCustomProjects(custom);
        return true;
    }

    canRemove(project: MobileProjectEntry): boolean {
        return !project.isCurrent && !project.github;
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
        if (project.uri) {
            await this.workspaceService.removeRecentWorkspace(project.uri.toString());
            return true;
        }
        return false;
    }

    /** Display name for the active workspace (matches the Projects panel entry). */
    getCurrentWorkspaceDisplayName(): string | undefined {
        const current = this.workspaceService.workspace;
        if (!current) {
            return undefined;
        }
        const uri = current.resource;
        const id = `ws:${uri.toString()}`;
        const name = this.labelProvider.getName(uri);
        return this.resolveDisplayName(id, name);
    }

    /** Last known branch for the active workspace; defaults to main for the mobile top bar. */
    getCurrentWorkspaceBranch(): string | undefined {
        const repoKey = this.currentRepoKey();
        if (!repoKey) {
            return undefined;
        }
        return readLocalProjectSessions().get(repoKey)?.branch || 'main';
    }

    getFilter(): MobileProjectFilter {
        return this.filter;
    }

    setFilter(filter: MobileProjectFilter): void {
        this.filter = filter;
    }

    getHubView(): MobileProjectsHubView {
        return normalizeWorkHubViewId(this.hubView) as MobileProjectsHubView;
    }

    setHubView(view: MobileProjectsHubView): void {
        const normalized = normalizeWorkHubViewId(view) as MobileProjectsHubView;
        this.hubView = normalized;
    }

    async loadProjects(): Promise<MobileProjectEntry[]> {
        // Open the SSE stream the first time projects are queried — the panel will subscribe to
        // tracker changes to live-update cards as VPS tasks start/finish.
        this.activeTasks.start();
        const sessionMap = await this.loadSessionMap();
        const entries: MobileProjectEntry[] = [];
        const seen = new Set<string>();
        const hiddenIds = this.readHiddenProjectIds();
        const pinnedIds = this.readPinnedProjectIds();

        const current = this.workspaceService.workspace;
        if (current) {
            const uri = current.resource;
            if (!seen.has(uri.toString())) {
                const name = this.labelProvider.getName(uri);
                const id = `ws:${uri.toString()}`;
                const now = new Date().toISOString();
                entries.push(this.applySessionToEntry({
                    id,
                    name: this.resolveDisplayName(id, name),
                    color: mobileProjectColorForName(name),
                    branch: uri.path.base,
                    status: 'working',
                    task: nls.localize('qaap/mobileProjects/currentTask', 'Active workspace'),
                    progress: 0.35,
                    agents: [{ role: 'ai', color: '#3B6FA0' }],
                    lastActive: nls.localize('qaap/mobileProjects/lastActiveNow', 'now'),
                    lastActiveAt: now,
                    tokens: '—',
                    cost: '—',
                    pinned: this.isPinned(id, pinnedIds, true),
                    uri,
                    isCurrent: true,
                }, sessionMap.get(id)));
                seen.add(uri.toString());
            }
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
                entries.push(this.applySessionToEntry({
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
                }, sessionMap.get(`ws:${key}`)));
            }
        } catch {
            /* recent list optional */
        }

        for (const stored of this.readCustomProjects()) {
            if (hiddenIds.has(stored.id) || entries.some(e => e.id === stored.id)) {
                continue;
            }
            if (stored.uri && seen.has(stored.uri)) {
                continue;
            }
            if (stored.uri) {
                seen.add(stored.uri);
            }
            entries.push(this.storedToEntry(stored, pinnedIds));
        }

        return this.overlayActiveTasks(this.sortProjectsByRecent(
            this.collapseCurrentWorkspaceDuplicates(entries).filter(p => !hiddenIds.has(p.id))
        ));
    }

    protected collapseCurrentWorkspaceDuplicates(entries: MobileProjectEntry[]): MobileProjectEntry[] {
        const current = entries.find(project => project.isCurrent);
        if (!current) {
            return entries;
        }
        const currentUri = current.uri?.toString();
        const currentName = this.normalizeProjectName(current.name);
        const currentGithubName = current.github ? this.normalizeProjectName(current.github.name) : undefined;
        return entries.filter(project => {
            if (project.isCurrent) {
                return true;
            }
            if (currentUri && project.uri?.toString() === currentUri) {
                return false;
            }
            const name = this.normalizeProjectName(project.name);
            if (currentName && name === currentName) {
                return false;
            }
            if (currentGithubName && name === currentGithubName) {
                return false;
            }
            const githubName = project.github ? this.normalizeProjectName(project.github.name) : undefined;
            return !githubName || githubName !== currentName;
        });
    }

    protected normalizeProjectName(name: string | undefined): string | undefined {
        const normalized = name?.trim().toLowerCase();
        return normalized || undefined;
    }

    /**
     * Overlay live VPS task state on top of the session-derived entries. A project with a task
     * actively running on the backend flips to `working` regardless of what the heuristic said,
     * because the backend is the source of truth for "is there an agent doing work right now".
     */
    protected overlayActiveTasks(projects: MobileProjectEntry[]): MobileProjectEntry[] {
        return projects.map(project => {
            const cwd = this.cwdForProject(project);
            if (!cwd) {
                return project;
            }
            const info = this.activeTasks.getForCwd(cwd);
            if (!info) {
                return project;
            }
            return {
                ...project,
                status: 'working',
                task: info.title ?? project.task,
                lastActive: nls.localize('qaap/mobileProjects/lastActiveNow', 'now'),
            };
        });
    }

    /**
     * Absolute filesystem path the backend would record as `cwd` for this project, or undefined
     * when the project has no local URI (e.g. a GitHub-only entry that has never been cloned).
     * Cross-OS note: `uri.path.toString()` is the fs path on POSIX; on Windows the leading slash
     * is stripped so the result matches what `path.resolve` produces on the backend.
     */
    /**
     * Absolute VPS path for agent tasks, when known. Uses the project URI, or the active
     * workspace when this card is the current repo (GitHub entries often omit `uri`).
     */
    getProjectCwd(project: MobileProjectEntry): string | undefined {
        const fromUri = this.cwdFromFileUri(project.uri);
        if (fromUri) {
            return fromUri;
        }
        if (project.isCurrent && this.workspaceService.workspace) {
            return this.cwdFromFileUri(this.workspaceService.workspace.resource);
        }
        return undefined;
    }

    getCurrentWorkspaceCwd(): string | undefined {
        return this.cwdFromFileUri(this.workspaceService.workspace?.resource);
    }

    getCurrentWorkspaceName(): string | undefined {
        const uri = this.workspaceService.workspace?.resource;
        return uri ? this.labelProvider.getName(uri) : undefined;
    }

    /**
     * Ensures a GitHub repo is cloned on the VPS and returns its path, without switching the
     * active workspace. Used by the dashboard "+" composer.
     */
    async prepareProjectCwd(project: MobileProjectEntry): Promise<string | undefined> {
        const existing = this.getProjectCwd(project);
        if (existing) {
            return existing;
        }
        if (!project.github || !readQaapSignedIn()) {
            return undefined;
        }
        try {
            const result = await openQaapGithubRepository(project.github.owner, project.github.name);
            return this.cwdFromFileUri(new URI(result.workspaceUri));
        } catch {
            return undefined;
        }
    }

    protected cwdForProject(project: MobileProjectEntry): string | undefined {
        return this.getProjectCwd(project);
    }

    protected cwdFromFileUri(uri: URI | undefined): string | undefined {
        if (!uri || uri.scheme !== 'file') {
            return undefined;
        }
        const raw = uri.path.toString();
        if (/^\/[A-Za-z]:/.test(raw)) {
            return raw.slice(1);
        }
        return raw;
    }

    /** Records hub metrics for the active workspace (local + server when signed in). */
    async recordProjectSession(patch: Omit<QaapProjectSessionUpsertRequest, 'repoKey'> & { repoKey?: string }): Promise<void> {
        const repoKey = patch.repoKey ?? this.currentRepoKey();
        if (!repoKey) {
            return;
        }
        const row: QaapProjectSessionSummary = {
            repoKey,
            branch: patch.branch ?? 'main',
            tokens: patch.tokens,
            cost: patch.cost,
            agentState: patch.agentState,
            lastTask: patch.lastTask,
            previewUrl: patch.previewUrl,
            bootstrapPhase: patch.bootstrapPhase,
            lastActiveAt: new Date().toISOString(),
        };
        patchLocalProjectSession(row);
        if (readQaapSignedIn()) {
            await upsertQaapProjectSession(row).catch(() => undefined);
        }
    }

    async recordProjectPreviewUrl(project: MobileProjectEntry, previewUrl: string): Promise<void> {
        const repoKey = this.projectSessionKey(project);
        if (!repoKey) {
            return;
        }
        await this.recordProjectSession({
            repoKey,
            branch: project.branch || 'main',
            previewUrl,
        });
    }

    async resolveProjectPreviewUrl(project: MobileProjectEntry, cwd?: string): Promise<string | undefined> {
        const repoKey = this.projectSessionKey(project);
        const cwdRepoKey = cwd ? `ws:${new URI(cwd).withScheme('file').toString()}` : undefined;
        if (!repoKey && !cwdRepoKey) {
            return project.previewUrl;
        }
        const sessions = await this.loadSessionMap();
        return (repoKey ? sessions.get(repoKey)?.previewUrl : undefined)
            ?? (cwdRepoKey ? sessions.get(cwdRepoKey)?.previewUrl : undefined)
            ?? project.previewUrl;
    }

    protected touchProjectActivity(project: MobileProjectEntry): void {
        const repoKey = this.projectSessionKey(project);
        if (!repoKey) {
            return;
        }
        this.touchProjectSession(repoKey, project.branch);
    }

    protected touchWorkspaceActivity(uri: URI): void {
        this.touchProjectSession(`ws:${uri.toString()}`, uri.path.base);
    }

    protected touchProjectSession(repoKey: string, branch: string): void {
        const row: QaapProjectSessionSummary = {
            repoKey,
            branch: branch || 'main',
            lastActiveAt: new Date().toISOString(),
        };
        patchLocalProjectSession(row);
        if (readQaapSignedIn()) {
            void upsertQaapProjectSession(row).catch(() => undefined);
        }
    }

    protected touchGithubRepositoryActivity(repository: QaapGithubRepositorySummary): void {
        this.touchProjectSession(`github:${repository.fullName}`, repository.defaultBranch);
    }

    protected projectSessionKey(project: MobileProjectEntry): string | undefined {
        if (project.github) {
            return `github:${project.github.fullName}`;
        }
        return project.uri ? `ws:${project.uri.toString()}` : undefined;
    }

    protected currentRepoKey(): string | undefined {
        const fullName = this.currentGithubRepositoryFullName();
        if (fullName) {
            return `github:${fullName}`;
        }
        const uri = this.workspaceService.workspace?.resource;
        return uri ? `ws:${uri.toString()}` : undefined;
    }

    /** Stable key used to defer hub actions until the selected project is the active workspace. */
    getProjectWorkspaceMatchKey(project: MobileProjectEntry): string | undefined {
        if (project.github) {
            return `github:${project.github.fullName.toLowerCase()}`;
        }
        return project.uri ? `ws:${project.uri.toString()}` : undefined;
    }

    /** Stable key for the workspace currently loaded in this window. */
    getCurrentWorkspaceMatchKey(): string | undefined {
        const fullName = this.currentGithubRepositoryFullName();
        if (fullName) {
            return `github:${fullName}`;
        }
        const uri = this.workspaceService.workspace?.resource;
        return uri ? `ws:${uri.toString()}` : undefined;
    }

    projectMatchesCurrentWorkspace(project: MobileProjectEntry): boolean {
        if (project.isCurrent) {
            return true;
        }
        const projectKey = this.getProjectWorkspaceMatchKey(project);
        return !!projectKey && projectKey === this.getCurrentWorkspaceMatchKey();
    }

    protected async loadSessionMap(): Promise<Map<string, QaapProjectSessionSummary>> {
        const local = readLocalProjectSessions();
        const config = await fetchQaapAuthConfig().catch(() => ({ skipAuth: false, githubOAuth: false }));
        if (config.skipAuth) {
            return local;
        }
        if (readQaapSignedIn()) {
            await syncQaapAuthSessionFromServer();
        }
        if (!readQaapSignedIn()) {
            return local;
        }
        try {
            const remote = await fetchQaapProjectSessions();
            const remoteMap = new Map(remote.sessions.map(s => [s.repoKey, s]));
            const merged = mergeSessionMaps(local, remoteMap);
            writeLocalProjectSessions(merged);
            return merged;
        } catch {
            return local;
        }
    }

    protected applySessionToEntry(entry: MobileProjectEntry, session?: QaapProjectSessionSummary): MobileProjectEntry {
        if (!session) {
            return entry;
        }
        const status = session.agentState ?? entry.status;
        const lastActiveAt = this.latestTimestamp(entry.lastActiveAt, session.lastActiveAt);
        return {
            ...entry,
            branch: session.branch || entry.branch,
            status,
            task: session.lastTask?.trim() || entry.task,
            tokens: session.tokens ?? entry.tokens,
            cost: session.cost ?? entry.cost,
            lastActive: lastActiveAt ? this.relativeUpdatedAt(lastActiveAt) : entry.lastActive,
            lastActiveAt,
            previewUrl: session.previewUrl ?? entry.previewUrl,
            progress: status === 'working' ? Math.max(entry.progress, 0.2) : entry.progress,
            agents: status === 'working' || status === 'review'
                ? (entry.agents.length > 0 ? entry.agents : [{ role: 'ai', color: '#3B6FA0' }])
                : entry.agents,
        };
    }

    protected async loadGithubProjects(sessionMap: Map<string, QaapProjectSessionSummary>, includeUnopened: boolean): Promise<MobileProjectEntry[]> {
        if (readQaapSignedIn()) {
            await syncQaapAuthSessionFromServer();
        }
        if (!readQaapSignedIn()) {
            return [];
        }
        try {
            const response = await fetchQaapGithubRepositories();
            const pinnedIds = this.readPinnedProjectIds();
            const currentFullName = this.currentGithubRepositoryFullName();
            const openedRepoKeys = new Set([...sessionMap.keys()].map(key => key.toLowerCase()));
            return response.repositories
                .filter(repo => includeUnopened
                    || repo.fullName.toLowerCase() === currentFullName
                    || openedRepoKeys.has(`github:${repo.fullName}`.toLowerCase()))
                .map(repo => this.applySessionToEntry(
                    this.githubRepositoryToProject(repo, pinnedIds, currentFullName),
                    sessionMap.get(`github:${repo.fullName}`) ?? sessionMap.get(`github:${repo.fullName.toLowerCase()}`)
                ));
        } catch (err) {
            console.warn('[qaap] Failed to load GitHub repositories:', err);
            return [];
        }
    }

    protected currentGithubRepositoryFullName(): string | undefined {
        const current = this.workspaceService.workspace?.resource;
        const segments = current?.path.toString().split('/').filter(Boolean) ?? [];
        const reposIndex = segments.lastIndexOf('repos');
        if (reposIndex < 0 || segments.length <= reposIndex + 2) {
            return undefined;
        }
        return `${segments[reposIndex + 1]}/${segments[reposIndex + 2]}`.toLowerCase();
    }

    protected githubRepositoryToProject(repo: QaapGithubRepositorySummary, pinnedIds: Set<string>, currentFullName?: string): MobileProjectEntry {
        const id = `github:${repo.fullName}`;
        const name = this.resolveDisplayName(id, repo.name);
        const isCurrent = repo.fullName.toLowerCase() === currentFullName;
        const lastActiveAt = isCurrent ? new Date().toISOString() : repo.updatedAt;
        const workspaceUri = isCurrent ? this.workspaceService.workspace?.resource : undefined;
        return {
            id,
            name,
            color: mobileProjectColorForName(repo.fullName),
            branch: repo.defaultBranch,
            status: isCurrent ? 'working' : 'idle',
            task: isCurrent
                ? nls.localize('qaap/mobileProjects/currentGithubTask', 'Open in this QAAP workspace')
                : repo.description?.trim()
                || (repo.private
                    ? nls.localize('qaap/mobileProjects/privateGithubRepo', 'Private GitHub repository')
                    : nls.localize('qaap/mobileProjects/githubRepo', 'GitHub repository')),
            progress: isCurrent ? 0.35 : 0,
            agents: isCurrent ? [{ role: 'ai', color: '#3B6FA0' }] : [],
            lastActive: isCurrent
                ? nls.localize('qaap/mobileProjects/lastActiveNow', 'now')
                : this.relativeUpdatedAt(repo.updatedAt),
            lastActiveAt,
            tokens: '—',
            cost: '—',
            pinned: this.isPinned(id, pinnedIds, isCurrent),
            uri: workspaceUri,
            github: {
                owner: repo.owner,
                name: repo.name,
                fullName: repo.fullName,
                htmlUrl: repo.htmlUrl,
                private: repo.private,
            },
            isCurrent,
        };
    }

    protected relativeUpdatedAt(value: string): string {
        const updated = Date.parse(value);
        if (!Number.isFinite(updated)) {
            return '—';
        }
        const diff = Math.max(0, Date.now() - updated);
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        if (diff < hour) {
            return nls.localize('qaap/mobileProjects/updatedMinutes', '{0} min', String(Math.max(1, Math.round(diff / minute))));
        }
        if (diff < day) {
            return nls.localize('qaap/mobileProjects/updatedHours', '{0} h', String(Math.round(diff / hour)));
        }
        return nls.localize('qaap/mobileProjects/updatedDays', '{0} d', String(Math.round(diff / day)));
    }

    protected sortProjectsByRecent(projects: MobileProjectEntry[]): MobileProjectEntry[] {
        return [...projects].sort((a, b) => this.projectActivityTime(b) - this.projectActivityTime(a));
    }

    protected projectActivityTime(project: MobileProjectEntry): number {
        if (!project.lastActiveAt) {
            return 0;
        }
        const time = Date.parse(project.lastActiveAt);
        return Number.isFinite(time) ? time : 0;
    }

    protected latestTimestamp(a?: string, b?: string): string | undefined {
        const timeA = a ? Date.parse(a) : NaN;
        const timeB = b ? Date.parse(b) : NaN;
        if (Number.isFinite(timeA) && Number.isFinite(timeB)) {
            return timeA >= timeB ? a : b;
        }
        if (Number.isFinite(timeA)) {
            return a;
        }
        return Number.isFinite(timeB) ? b : undefined;
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
