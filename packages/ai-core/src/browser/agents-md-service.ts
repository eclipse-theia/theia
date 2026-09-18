// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { Disposable, DisposableCollection, Emitter, Event, ILogger, URI } from '@theia/core';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent, FileOperationEvent } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { AGENTS_MD_FILE_NAME } from '../common/agents-md';

/** Debounce delay for coalescing rapid file system events. */
const UPDATE_DEBOUNCE_MS = 50;

export interface AgentsMdFile {
    /** URI of the discovered `AGENTS.md`. */
    uri: URI;
    /** Content as of the last scan. */
    content: string;
    /** Name of the workspace root holding the file, used as provenance label when merging several roots. */
    rootName: string;
}

export const AgentsMdService = Symbol('AgentsMdService');
export interface AgentsMdService {
    /** The `AGENTS.md` files discovered in the workspace roots, in workspace root order. */
    getAgentsMdFiles(): AgentsMdFile[];

    /** Fired after every scan, whether or not the result changed. */
    readonly onDidChange: Event<void>;

    /** Resolves once the initial scan is complete. Always resolves, even if the scan failed. */
    readonly ready: Promise<void>;
}

/**
 * Discovers `<root>/AGENTS.md` for every workspace root and keeps the content up to date.
 *
 * Only the workspace roots themselves are scanned. A nested `AGENTS.md` cascade with proximity
 * precedence, `@path` imports and a global `~/.agents/AGENTS.md` are deliberately out of scope.
 */
@injectable()
export class DefaultAgentsMdService implements AgentsMdService, Disposable {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(ILogger) @named('ai-core:DefaultAgentsMdService')
    protected readonly logger: ILogger;

    protected files: AgentsMdFile[] = [];

    /** Watchers of the current scan; disposed and rebuilt on every rescan. */
    protected toDispose = new DisposableCollection();
    /** Kept apart from {@link toDispose}, which does not survive a rescan. */
    protected readonly toDisposeOnServiceDispose = new DisposableCollection();

    /** URIs of the `AGENTS.md` files we react to: one per workspace root, whether or not it exists. */
    protected watchedFiles = new Set<string>();

    protected updateDebounceTimeout: ReturnType<typeof setTimeout> | undefined;

    /** True while {@link update} is running, so concurrent callers do not duplicate the scan. */
    protected updateInProgress = false;
    /** Set when {@link update} is called while another run is in progress; triggers a follow-up scan. */
    protected updateRescheduled = false;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    protected _ready = new Deferred<void>();
    get ready(): Promise<void> {
        return this._ready.promise;
    }

    @postConstruct()
    protected init(): void {
        this.toDisposeOnServiceDispose.push(this.onDidChangeEmitter);
        this.toDisposeOnServiceDispose.push(this.fileService.onDidFilesChange((event: FileChangesEvent) => {
            if (event.changes.some(change => this.isWatched(change.resource))) {
                this.scheduleUpdate();
            }
        }));
        // The watcher above only reports what the backend sees, and `FileService.watch` registers
        // that watcher asynchronously. An `AGENTS.md` written through the application right after
        // startup - most notably by the migration - therefore lands in the gap before the watcher is
        // live and would be missed for the rest of the session. Operations performed through the
        // FileService are reported here synchronously, independent of any watcher.
        this.toDisposeOnServiceDispose.push(this.fileService.onDidRunOperation((event: FileOperationEvent) => {
            if (this.isWatched(event.resource) || (event.target && this.isWatched(event.target.resource))) {
                this.scheduleUpdate();
            }
        }));
        this.initialize();
    }

    protected async initialize(): Promise<void> {
        try {
            await this.workspaceService.ready;
        } catch (error) {
            this.logger.error('Failed to resolve the workspace, scanning the already known roots for AGENTS.md', error);
        }
        // Listen before the initial scan, otherwise a change landing while it runs is recorded as
        // already applied and dropped. update()'s in-progress guard coalesces the overlap.
        this.toDisposeOnServiceDispose.push(this.workspaceService.onWorkspaceChanged(() => this.scheduleUpdate()));
        try {
            await this.update();
        } catch (error) {
            this.logger.error('Initial AGENTS.md scan failed', error);
        }
        this._ready.resolve();
    }

    getAgentsMdFiles(): AgentsMdFile[] {
        return [...this.files];
    }

    /** Whether `resource` is one of the `AGENTS.md` locations this service tracks. */
    protected isWatched(resource: URI): boolean {
        return this.watchedFiles.has(resource.toString());
    }

    dispose(): void {
        if (this.updateDebounceTimeout) {
            clearTimeout(this.updateDebounceTimeout);
            this.updateDebounceTimeout = undefined;
        }
        this.toDisposeOnServiceDispose.dispose();
        this.toDispose.dispose();
    }

    protected scheduleUpdate(): void {
        if (this.updateDebounceTimeout) {
            clearTimeout(this.updateDebounceTimeout);
        }
        this.updateDebounceTimeout = setTimeout(() => {
            this.updateDebounceTimeout = undefined;
            this.update();
        }, UPDATE_DEBOUNCE_MS);
    }

    protected async update(): Promise<void> {
        if (this.updateDebounceTimeout) {
            clearTimeout(this.updateDebounceTimeout);
            this.updateDebounceTimeout = undefined;
        }
        // Serialise concurrent calls: a workspace-ready trigger and a file-change-driven
        // scheduleUpdate() can fire within the same async tick. The second caller records a pending
        // request and lets the first finish; the follow-up is re-scheduled through the debouncer.
        if (this.updateInProgress) {
            this.updateRescheduled = true;
            return;
        }
        this.updateInProgress = true;
        try {
            await this.doUpdate();
        } finally {
            this.updateInProgress = false;
            if (this.updateRescheduled) {
                this.updateRescheduled = false;
                this.scheduleUpdate();
            }
        }
    }

    protected async doUpdate(): Promise<void> {
        const newDisposables = new DisposableCollection();
        const newFiles: AgentsMdFile[] = [];
        const roots = this.workspaceService.tryGetRoots();

        // Publish the tracked locations before doing any I/O. A file operation landing while this
        // scan is still running has to be recognized so that the in-progress guard can reschedule;
        // assigning only at the end would drop it and leave this scan's stale result in place.
        this.watchedFiles = new Set(roots.map(root => root.resource.resolve(AGENTS_MD_FILE_NAME).toString()));

        for (const root of roots) {
            const fileUri = root.resource.resolve(AGENTS_MD_FILE_NAME);
            // Watch the root, not the file: a watcher on a missing file cannot report its creation.
            newDisposables.push(this.fileService.watch(root.resource, { recursive: false, excludes: [] }));
            try {
                if (await this.fileService.exists(fileUri)) {
                    const content = await this.fileService.read(fileUri);
                    newFiles.push({ uri: fileUri, content: content.value, rootName: root.name });
                }
            } catch (error) {
                this.logger.error(`Failed to read '${fileUri.toString()}': ${error}`);
            }
        }

        this.toDispose.dispose();
        this.toDispose = newDisposables;
        this.files = newFiles;

        this.onDidChangeEmitter.fire();
    }
}
