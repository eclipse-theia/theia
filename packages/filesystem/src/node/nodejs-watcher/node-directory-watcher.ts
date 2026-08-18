// *****************************************************************************
// Copyright (C) 2026 Ehab Younes and others.
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

import * as path from 'path';
import { timeout } from '@theia/core/lib/common/promise-util';
import { CancellationToken, CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { DirectoryIdentity, WatcherHost } from './watcher-host';
import { FileChangeType, FileSystemWatcherServiceClient } from '../../common/filesystem-watcher-protocol';
import { AbstractFileSystemWatcher, AbstractWatcherProvider, ResolvedWatchOptions, WatcherLogger, WatchRequest } from '../filesystem-watcher';
import { DirectoryWatchRequest, ResolvedChange, WatchRequestRouter } from './watch-request-router';
import throttle = require('@theia/core/shared/lodash.throttle');

/** How far the poll interval stretches while a handle refuses to open. */
const MAX_OPEN_BACKOFF = 10;

export interface NodeDirectoryWatcherTimings {
    /** Aggregation window before raw events are resolved against the file system. */
    readonly changeDelay: number;
    /** Grace period before a deletion is confirmed, so an atomic save is not reported as one. */
    readonly deleteDelay: number;
    /** Poll interval for a path that does not exist yet. */
    readonly existencePollDelay: number;
    /** How long an unreferenced watcher is kept, so a reconnecting frontend can reuse it. */
    readonly deferredDisposalTimeout: number;
}

export namespace NodeDirectoryWatcherTimings {
    /** Every delay drives a `setTimeout`, where anything below 1ms silently becomes 1ms. */
    export function validate(timings: NodeDirectoryWatcherTimings): void {
        for (const [name, value] of Object.entries(timings)) {
            if (!Number.isFinite(value) || value <= 0) {
                throw new Error(`Watcher timing "${name}" must be a positive number, was ${value}`);
            }
        }
    }
}

export const DEFAULT_WATCHER_TIMINGS: NodeDirectoryWatcherTimings = {
    changeDelay: 75,
    deleteDelay: 100,
    existencePollDelay: 500,
    deferredDisposalTimeout: 10_000
};

interface PendingEvent {
    eventType: string;
    fileName: string | undefined;
}

/**
 * Watches one directory level with Node's `fs.watch`.
 *
 * One instance serves every non-recursive request resolving to the same directory, whether for the directory
 * itself or for a single file inside it. Sharing saves more than handles: on macOS libuv keeps one
 * `FSEventStream` per event loop and recreates it whenever any handle opens or closes, dropping the events of
 * every other watcher meanwhile.
 */
export class NodeDirectoryWatcher extends AbstractFileSystemWatcher {

    // What is being watched, and what changes are resolved against.
    protected watchedDirectory: string;
    private handle: ReturnType<WatcherHost['watch']> | undefined;
    private identity: DirectoryIdentity | undefined;
    /** Direct children of {@link watchedDirectory}, kept in sync to classify changes and to diff a rescan. */
    protected children = new Set<string>();

    // Who asked, and what they excluded.
    protected readonly router: WatchRequestRouter;

    // Events in flight: aggregated, then resolved one batch at a time.
    private readonly pendingEvents: PendingEvent[] = [];
    private readonly pendingDeletes = new Map<string, NodeJS.Timeout>();
    private changeQueue: Promise<void> = Promise.resolve();
    /** Collects raw events for one `changeDelay` window, counted from the first. */
    private readonly scheduleFlush: (() => void) & { cancel(): void };

    // Lifecycle.
    /** Cancels the start attempt in flight, so a superseded one writes no state and opens no handle. */
    private attempt = new CancellationTokenSource();
    private disposalTimer: NodeJS.Timeout | undefined;
    private openFailed = false;

    /** Resolves once the watcher is up, or once it got disposed while starting. Never rejects. */
    readonly whenStarted: Promise<void>;

    constructor(
        target: string,
        options: WatcherLogger,
        protected readonly client: FileSystemWatcherServiceClient,
        protected readonly timings: NodeDirectoryWatcherTimings = DEFAULT_WATCHER_TIMINGS,
        protected readonly host: WatcherHost = new WatcherHost(options)
    ) {
        super(target, options);
        this.router = this.createRouter();
        NodeDirectoryWatcherTimings.validate(timings);
        this.scheduleFlush = throttle(() => this.flush(), timings.changeDelay, { leading: false });
        this.watchedDirectory = target;
        this.whenStarted = this.start(this.attempt.token).catch(error => this.error(`Watcher failed to start at "${this.target}":`, error));
    }

    protected createRouter(): WatchRequestRouter {
        return new WatchRequestRouter(this.client, this.host, () => this.watchedDirectory);
    }

    addRequest(watcherId: number, request: DirectoryWatchRequest): void {
        this.router.add(watcherId, request);
        clearTimeout(this.disposalTimer);
        this.debug('REQUEST++', `watcherId=${watcherId}, requests=${this.router.size}`);
    }

    removeRequest(watcherId: number): void {
        if (this.router.remove(watcherId) && this.router.size === 0) {
            this.disposalTimer = setTimeout(() => this.dispose(), this.timings.deferredDisposalTimeout);
        }
        this.debug('REQUEST--', `watcherId=${watcherId}, requests=${this.router.size}`);
    }

    dispose(): void {
        if (!this.markDisposed()) {
            return;
        }
        this.attempt.cancel();
        this.closeHandle();
        this.clearPendingDeletes();
        this.scheduleFlush.cancel();
        clearTimeout(this.disposalTimer);
        this.debug('DISPOSED');
    }

    /** Waits for the target, then opens the handle before reading the children, so no change is missed. */
    protected async start(token: CancellationToken, missing = false, previousChildren?: Set<string>): Promise<void> {
        if (this.host.isUnsupportedTarget(this.target)) {
            this.error(`Refusing to watch "${this.target}": watching a macOS network share is unstable.`);
            return;
        }
        const wasMissing = await this.openWhenAvailable(token) || missing;
        if (token.isCancellationRequested) {
            return;
        }
        const onDisk = await this.recordSnapshot();
        if (token.isCancellationRequested) {
            return;
        }
        this.debug('STARTED', this.watchedDirectory);
        if (wasMissing) {
            const requests = await this.router.existingRequests();
            if (token.isCancellationRequested) {
                return;
            }
            this.router.reportWatchedPath(FileChangeType.ADDED, requests);
        }
        if (previousChildren) {
            this.router.report(this.diff(previousChildren, onDisk));
        }
    }

    /** Polls until the target exists and a handle is open. Resolves to whether it was ever missing. */
    protected async openWhenAvailable(token: CancellationToken): Promise<boolean> {
        let wasMissing = false;
        let failedOpens = 0;
        while (!token.isCancellationRequested) {
            if (!await this.host.exists(this.target)) {
                wasMissing = true;
            } else {
                await this.resolveWatchedDirectory();
                if (token.isCancellationRequested || this.openHandle()) {
                    break;
                }
                // EACCES or an exhausted budget will not clear on its own; do not hammer the syscall.
                failedOpens = Math.min(failedOpens + 1, MAX_OPEN_BACKOFF);
            }
            await timeout(this.timings.existencePollDelay * Math.max(failedOpens, 1), token).catch(() => undefined);
        }
        return wasMissing;
    }

    /** Records what changes are resolved against: the directory's children and its identity. */
    private async recordSnapshot(): Promise<Set<string>> {
        const onDisk = await this.host.readChildren(this.watchedDirectory);
        const children = new Set(onDisk);
        // Resolving an event that landed during the read against a set already holding the name would call
        // a creation an update. Only the stored set is adjusted; the caller diffs against what is there.
        for (const event of this.pendingEvents) {
            if (event.fileName) {
                children.delete(event.fileName);
            }
        }
        this.children = children;
        this.identity = await this.host.readIdentity(this.watchedDirectory);
        return onDisk;
    }

    /**
     * Applies {@link NodeDirectoryWatcher.resolveTarget} to this watcher. A target that turns out to be a file
     * only once it appears was requested as a directory, so its requests are narrowed to that file here.
     */
    protected async resolveWatchedDirectory(): Promise<void> {
        const resolved = await this.host.resolveTarget(this.target);
        this.watchedDirectory = resolved.directory;
        if (!this.host.samePath(resolved.realPath, this.watchedDirectory)) {
            // The target only turned out to be a file once it appeared, so requests for it are narrowed.
            this.router.narrow(this.target, resolved.realPath);
        }
    }

    protected openHandle(): boolean {
        try {
            this.handle = this.host.watch(this.watchedDirectory, (eventType, fileName) => this.handleEvent(eventType, fileName));
            this.handle.on('error', error => this.restart(error));
            this.openFailed = false;
            return true;
        } catch (error) {
            // Polling recovers a missing directory, but not EACCES or an exhausted handle budget.
            if (!this.openFailed) {
                this.openFailed = true;
                this.error(`Watcher failed to open a handle at "${this.watchedDirectory}", retrying every ${this.timings.existencePollDelay}ms:`, error);
            }
            return false;
        }
    }

    private closeHandle(): void {
        if (this.handle) {
            this.handle.removeAllListeners();
            this.handle.close();
            this.handle = undefined;
        }
    }

    protected handleEvent(eventType: string, fileName: string | null): void {
        if (this.isDisposed) {
            return;
        }
        // Windows reports a `ReadDirectoryChangesW` buffer overflow as a change without a file name. Only a
        // rescan can recover the events lost with it.
        this.pendingEvents.push({ eventType, fileName: fileName ? this.host.normalizeFileName(fileName) : undefined });
        this.scheduleFlush();
    }

    private flush(): void {
        const events = this.pendingEvents.splice(0);
        this.enqueue(() => this.processEvents(events));
    }

    /** Serializes the async parts of change handling so later events cannot overtake earlier ones. */
    private enqueue(resolve: () => Promise<ResolvedChange[]>): void {
        this.changeQueue = this.changeQueue
            .then(async () => {
                if (!this.isDisposed && this.router.size > 0) {
                    this.router.report(await resolve());
                }
            })
            .catch(error => this.error(`Watcher failed to process changes at "${this.watchedDirectory}":`, error));
    }

    protected async processEvents(events: PendingEvent[]): Promise<ResolvedChange[]> {
        const changes: ResolvedChange[] = [];
        let renamed = false;
        for (const { eventType, fileName } of events) {
            if (fileName === undefined) {
                const rescanned = await this.host.readChildren(this.watchedDirectory);
                const rescanChanges = this.diff(this.children, rescanned);
                // Reading the directory settles what a pending deletion was waiting for.
                rescanChanges.forEach(change => this.cancelDelete(change.fileName));
                changes.push(...rescanChanges);
                this.children = rescanned;
            } else if (fileName.includes('/') || fileName.includes('\\')) {
                continue;
            } else if (eventType === 'rename') {
                renamed = true;
                if (!this.namesWatchedDirectory(fileName)) {
                    const change = await this.resolveRename(fileName);
                    if (change) {
                        changes.push(change);
                    }
                }
            } else if (this.children.has(fileName)) {
                changes.push({ fileName, type: FileChangeType.UPDATED });
            } else {
                // Unknown, so it changed during the read. Recorded too, or the set stays stale.
                this.children.add(fileName);
                changes.push({ fileName, type: FileChangeType.ADDED });
            }
        }
        if (renamed && await this.isWatchedDirectoryGone()) {
            this.restart();
            return [];
        }
        return changes;
    }

    /**
     * Whether an event names the watched directory rather than a child. macOS reports it for any change
     * inside, so only {@link isWatchedDirectoryGone} settles whether it is still there.
     */
    protected namesWatchedDirectory(fileName: string): boolean {
        return !this.children.has(fileName)
            && this.host.samePath(fileName, this.host.normalizeFileName(path.basename(this.watchedDirectory)));
    }

    /** The change this rename resolves to, or `undefined` when it is deferred to the delete timer. */
    protected async resolveRename(fileName: string): Promise<ResolvedChange | undefined> {
        if (!await this.host.childExists(this.watchedDirectory, fileName)) {
            this.scheduleDelete(fileName);
            return undefined;
        }
        this.cancelDelete(fileName);
        if (this.children.has(fileName)) {
            return { fileName, type: FileChangeType.UPDATED };
        }
        this.children.add(fileName);
        return { fileName, type: FileChangeType.ADDED };
    }

    /**
     * A deletion is confirmed rather than reported right away: tools that save atomically delete and recreate
     * the file, which would otherwise surface as a deletion followed by an addition.
     */
    private scheduleDelete(fileName: string): void {
        if (this.isDisposed || this.pendingDeletes.has(fileName)) {
            return;
        }
        this.pendingDeletes.set(fileName, setTimeout(() => {
            this.enqueue(() => this.confirmDelete(fileName));
        }, this.timings.deleteDelay));
    }

    private cancelDelete(fileName: string): void {
        clearTimeout(this.pendingDeletes.get(fileName));
        this.pendingDeletes.delete(fileName);
    }

    private clearPendingDeletes(): void {
        for (const timer of this.pendingDeletes.values()) {
            clearTimeout(timer);
        }
        this.pendingDeletes.clear();
    }

    protected async confirmDelete(fileName: string): Promise<ResolvedChange[]> {
        if (!this.pendingDeletes.delete(fileName)) {
            // Cancelled after the timer fired but before this ran, so the deletion was already settled.
            return [];
        }
        const known = this.children.has(fileName);
        if (await this.host.childExists(this.watchedDirectory, fileName)) {
            this.children.add(fileName);
            return [{ fileName, type: known ? FileChangeType.UPDATED : FileChangeType.ADDED }];
        }
        this.children.delete(fileName);
        return known
            ? [{ fileName, type: FileChangeType.DELETED }]
            // It appeared and vanished within the delay, so report both rather than a deletion from nowhere.
            : [{ fileName, type: FileChangeType.ADDED }, { fileName, type: FileChangeType.DELETED }];
    }

    /**
     * Compares identity rather than mere existence: a directory that is deleted and recreated leaves the handle
     * bound to the old inode, where it would never report anything again.
     */
    protected async isWatchedDirectoryGone(): Promise<boolean> {
        const identity = await this.host.readIdentity(this.watchedDirectory);
        if (!identity) {
            return true;
        }
        return this.identity !== undefined && (identity.dev !== this.identity.dev
            || identity.ino !== this.identity.ino
            || identity.birthtimeMs !== this.identity.birthtimeMs);
    }

    /** Closes the handle and starts over, reporting the watched paths as deleted if the directory is gone. */
    protected restart(error?: unknown): void {
        if (this.isDisposed) {
            return;
        }
        // Supersede whatever attempt is in flight rather than decline to start one.
        this.attempt.cancel();
        const token = (this.attempt = new CancellationTokenSource()).token;
        this.debug('RESTART', error ?? '');
        this.closeHandle();
        this.clearPendingDeletes();
        this.pendingEvents.length = 0;
        this.scheduleFlush.cancel();
        const previousChildren = new Set(this.children);
        this.changeQueue = this.changeQueue.then(async () => {
            if (token.isCancellationRequested) {
                return;
            }
            // A handle can also fail while the directory is untouched, and then nothing changed.
            const gone = await this.isWatchedDirectoryGone();
            if (token.isCancellationRequested) {
                return;
            }
            if (gone) {
                // Losing the directory takes every requested path inside it along.
                this.router.reportWatchedPath(FileChangeType.DELETED);
            }
            // Only a comparison of the contents can recover what happened while the watcher was down.
            await this.start(token, gone, previousChildren);
        }).catch(restartError => this.error(`Watcher failed to restart at "${this.target}":`, restartError));
    }

    protected diff(previous: Set<string>, current: Set<string>): ResolvedChange[] {
        const changes: ResolvedChange[] = [];
        for (const fileName of current) {
            if (!previous.has(fileName)) {
                changes.push({ fileName, type: FileChangeType.ADDED });
            }
        }
        for (const fileName of previous) {
            if (!current.has(fileName)) {
                changes.push({ fileName, type: FileChangeType.DELETED });
            }
        }
        return changes;
    }

}

/** Serves non-recursive requests. Those resolving to the same directory share one watcher, file or folder alike. */
export class DirectoryWatcherProvider extends AbstractWatcherProvider {

    constructor(
        protected readonly options: WatcherLogger,
        protected readonly client: FileSystemWatcherServiceClient,
        protected readonly timings?: NodeDirectoryWatcherTimings,
        /** Shared, so every watcher this provider makes resolves paths the same way. */
        protected readonly host: WatcherHost = new WatcherHost(options)
    ) {
        super();
    }

    canHandle(options: ResolvedWatchOptions): boolean {
        return !options.recursive;
    }

    async watch(watcherId: number, request: WatchRequest): Promise<NodeDirectoryWatcher> {
        const { directory, realPath } = await this.host.resolveTarget(request.path);
        // Nothing is awaited below, so concurrent requests for one directory cannot both create a watcher.
        const watcher = this.getOrCreateWatcher(this.watcherKey(directory), () => this.createWatcher(directory));
        watcher.addRequest(watcherId, { ...request, realPath });
        return watcher;
    }

    /** Excludes are left out: one level has nothing to prune, so they apply per request. */
    protected watcherKey(directory: string): string {
        return this.host.caseInsensitiveFileNames ? directory.toLowerCase() : directory;
    }

    protected createWatcher(directory: string): NodeDirectoryWatcher {
        return new NodeDirectoryWatcher(directory, this.options, this.client, this.timings, this.host);
    }
}
