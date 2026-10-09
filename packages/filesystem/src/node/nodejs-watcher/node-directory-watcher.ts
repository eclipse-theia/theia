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
import { Emitter } from '@theia/core';
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

/** What the events of one batch share: one directory read, and one timer for the deletions they defer. */
interface EventBatch {
    /** The child's name on disk, which can differ from `fileName` in case, or `undefined` if there is none. */
    storedName(fileName: string): Promise<string | undefined>;
    scheduleDelete(fileName: string): void;
}

/**
 * Watches one directory level with Node's `fs.watch`.
 *
 * One instance serves every non-recursive request resolving to the same directory, for the directory itself
 * or for a single file in it. Sharing saves more than handles: on macOS libuv keeps one `FSEventStream` per
 * event loop and rebuilds it whenever a handle opens or closes, losing every other watcher's events.
 */
export class NodeDirectoryWatcher extends AbstractFileSystemWatcher {

    // What is being watched, and what changes are resolved against.
    protected watchedDirectory: string;
    /** The path polled and resolved on each start: the target, or its directory once it turned out to be a file. */
    protected watchPath: string;
    private handle: ReturnType<WatcherHost['watch']> | undefined;
    /** The identity of the directory the handle is bound to, read before it opened. */
    private identity: DirectoryIdentity | undefined;
    /** Direct children of {@link watchedDirectory}, kept in sync to classify changes and to diff a rescan. */
    protected children = new Set<string>();
    /** Set once a start recorded the children. Until then, what clients saw of them is unknown. */
    private started = false;
    /** The children clients last saw. Kept until a restart reports its diff, so a superseded restart passes it on. */
    private restartBaseline: Set<string> | undefined;
    /** Set once the watched path is found missing or reported deleted, until a start reports it added. */
    private watchedPathMissing = false;
    /** The directory last announced through {@link onDidResolveDirectory}, which the provider keys the watcher by. */
    private announcedDirectory: string;

    // Who asked, and what they excluded.
    protected readonly router: WatchRequestRouter;

    // Events in flight: aggregated, then resolved one batch at a time.
    private readonly pendingEvents: PendingEvent[] = [];
    private readonly pendingDeletes = new Map<string, NodeJS.Timeout>();
    private changeQueue: Promise<void>;
    /** Names from `rename` events that arrive while {@link readChildren} runs, else `undefined`. */
    private renamedDuringRead: Set<string> | undefined;
    /** Collects raw events for one `changeDelay` window, counted from the first. */
    private readonly scheduleFlush: (() => void) & { cancel(): void };

    // Lifecycle.
    /** Cancels the start attempt in flight, so a superseded one opens no handle. */
    private attempt = new CancellationTokenSource();
    private disposalTimer: NodeJS.Timeout | undefined;
    private openFailed = false;
    private readonly directoryResolvedEmitter = new Emitter<void>();

    /** Fires when {@link directory} changes, for example when a missing target appears as a file. */
    readonly onDidResolveDirectory = this.directoryResolvedEmitter.event;

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
        this.watchPath = target;
        this.announcedDirectory = target;
        // Queued, as a restart is, so that events flushed during the first read wait for its snapshot.
        this.changeQueue = this.whenStarted = this.start(this.attempt.token)
            .catch(error => this.error(`Watcher failed to start at "${this.target}":`, error));
    }

    /** The directory the handle is on, settled once {@link whenStarted} resolved. */
    get directory(): string {
        return this.watchedDirectory;
    }

    /** Drains the requests, so that they can be moved to the watcher serving their directory. */
    takeRequests(): Map<number, DirectoryWatchRequest> {
        return this.router.takeAll();
    }

    /**
     * Serves requests that a re-key moved here. Their clients take their path for missing, so after the work queued
     * before them runs, the watcher reports their path added if it exists.
     */
    adoptRequests(requests: Map<number, DirectoryWatchRequest>): void {
        if (requests.size === 0) {
            return;
        }
        clearTimeout(this.disposalTimer);
        this.router.adopt(requests);
        this.changeQueue = this.changeQueue
            .then(() => {
                if (!this.isDisposed) {
                    // While the directory is missing, the start that recovers it reports their path.
                    this.router.admitAdopted(this.children, !this.watchedPathMissing);
                }
            })
            .catch(error => this.error(`Watcher failed to adopt requests at "${this.watchedDirectory}":`, error));
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
        this.directoryResolvedEmitter.dispose();
        this.debug('DISPOSED');
    }

    /** Waits for the target, then opens the handle before reading the children, so no change is missed. */
    protected async start(token: CancellationToken): Promise<void> {
        if (this.host.isUnsupportedTarget(this.target)) {
            this.error(`Refusing to watch "${this.target}": watching a macOS network share is unstable.`);
            return;
        }
        await this.openWhenAvailable(token);
        if (token.isCancellationRequested) {
            return;
        }
        const children = await this.readChildren(this.restartBaseline ?? new Set());
        if (this.isDisposed) {
            return;
        }
        if (await this.isWatchedDirectoryGone()) {
            // Lost or replaced during the read, so the read describes no directory the handle is on.
            this.restart();
            return;
        }
        // Batches now resolve against this snapshot, so even a superseded start reports it.
        this.children = children;
        this.started = true;
        this.debug('STARTED', this.watchedDirectory);
        if (!this.host.samePath(this.watchedDirectory, this.announcedDirectory)) {
            // The baseline lists another directory's children, so skip its diff.
            this.restartBaseline = undefined;
            this.announcedDirectory = this.watchedDirectory;
            this.directoryResolvedEmitter.fire();
            if (this.isDisposed) {
                // Merged into the watcher already on the directory, which reports to the requests instead.
                return;
            }
        }
        // After a reported loss, file requests hear of their file here, so the diff skips them.
        const lossReported = this.watchedPathMissing;
        if (lossReported) {
            this.router.reportWatchedPath(FileChangeType.ADDED, this.router.matching(request => this.router.knows(request, children)));
            this.watchedPathMissing = false;
        }
        if (this.restartBaseline) {
            this.router.report(this.diff(this.restartBaseline, children), request => !lossReported || this.router.watchesDirectory(request));
            this.restartBaseline = undefined;
        }
    }

    /** Polls until the target exists as a directory to watch and a handle is open. */
    protected async openWhenAvailable(token: CancellationToken): Promise<void> {
        let failedOpens = 0;
        while (!token.isCancellationRequested) {
            if (!await this.host.exists(this.watchPath) || !await this.resolveWatchedDirectory()) {
                this.markMissing();
            } else {
                // Read before the handle opens, so a replacement after this point shows as another identity.
                const identity = await this.host.readIdentity(this.watchedDirectory);
                if (identity && !token.isCancellationRequested) {
                    if (this.openHandle()) {
                        this.identity = identity;
                        break;
                    }
                    // EACCES or an exhausted budget does not clear on its own, so back off.
                    failedOpens = Math.min(failedOpens + 1, MAX_OPEN_BACKOFF);
                }
            }
            await timeout(this.timings.existencePollDelay * Math.max(failedOpens, 1), token).catch(() => undefined);
        }
    }

    /** Records the watched path as missing. A restart tells clients; on the first start they asked for a missing path. */
    private markMissing(): void {
        if (this.restartBaseline) {
            this.reportLoss();
        } else {
            this.watchedPathMissing = true;
        }
    }

    /** Reports the watched path deleted, once. A file request hears it if its file was a known child, or no start recorded the children yet. */
    private reportLoss(): void {
        if (this.watchedPathMissing) {
            return;
        }
        this.watchedPathMissing = true;
        this.router.reportWatchedPath(FileChangeType.DELETED, this.router.matching(request => !this.started || this.router.watchesDirectory(request)));
        if (this.started) {
            this.router.report(this.diff(this.children, new Set()), request => !this.router.watchesDirectory(request));
        }
    }

    /**
     * Reads the children. A child renamed during the read keeps its membership in `known`, as the read can list it
     * or not, and its own event reports it. Only a `rename` announces a creation or a deletion.
     */
    private async readChildren(known: ReadonlySet<string>): Promise<Set<string>> {
        const renamed = this.renamedDuringRead = new Set<string>();
        let children: Set<string>;
        try {
            children = await this.host.readChildren(this.watchedDirectory);
        } finally {
            this.renamedDuringRead = undefined;
        }
        for (const fileName of renamed) {
            if (known.has(fileName)) {
                children.add(fileName);
            } else {
                children.delete(fileName);
            }
        }
        return children;
    }

    /**
     * Resolves the target to the directory to watch. Requests made while the target was missing are resolved
     * here too, and narrowed to the file if the target is one.
     * @returns `false` if the path is a file that the watcher cannot follow to its parent.
     */
    protected async resolveWatchedDirectory(): Promise<boolean> {
        const resolved = await this.host.resolveTarget(this.watchPath);
        const isFile = !this.host.samePath(resolved.realPath, resolved.directory);
        // Only requests for the target itself follow it to its parent. Requests inside it wait for the directory.
        if (isFile && (this.watchPath !== this.target || !this.router.allFor(this.target))) {
            return false;
        }
        if (isFile) {
            // The target as watched is gone, and the start reports it added as a file.
            this.markMissing();
        }
        this.watchedDirectory = resolved.directory;
        if (this.watchPath === this.target) {
            this.router.resolveRequests(this.target, resolved.realPath);
            if (isFile) {
                // After the re-key, requests for the directory can join, so a restart polls the directory rather
                // than the file.
                this.watchPath = resolved.directory;
            }
        }
        return true;
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
        const normalized = fileName ? this.host.normalizeFileName(fileName) : undefined;
        if (normalized && eventType === 'rename') {
            this.renamedDuringRead?.add(normalized);
        }
        this.pendingEvents.push({ eventType, fileName: normalized });
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
                // Runs even with no request attached: skipping would leave the children and a pending
                // deletion stale for a request arriving within the disposal grace period. Before a start recorded
                // the children, or while the directory is missing, the start or restart queued next covers it.
                if (!this.isDisposed && this.started && !this.watchedPathMissing) {
                    this.router.report(await resolve());
                }
            })
            .catch(error => this.error(`Watcher failed to process changes at "${this.watchedDirectory}":`, error));
    }

    protected async processEvents(events: PendingEvent[]): Promise<ResolvedChange[]> {
        const changes: ResolvedChange[] = [];
        let renamed = false;
        let rescan = false;
        const batch = this.createBatch();
        for (const { eventType, fileName } of events) {
            if (fileName === undefined) {
                rescan = true;
            } else if (fileName.includes('/') || fileName.includes('\\')) {
                continue;
            } else if (eventType === 'rename') {
                renamed = true;
                if (!await this.namesWatchedDirectory(fileName, batch)) {
                    const change = await this.resolveRename(fileName, batch);
                    if (change) {
                        changes.push(change);
                    }
                }
            } else if (await this.namesWatchedDirectory(fileName, batch)) {
                // A metadata change on the watched directory itself, which libuv names after the directory.
                continue;
            } else {
                // A child the snapshot missed. Record it, or the set stays stale.
                changes.push(this.recordPresent(fileName));
            }
        }
        if (renamed && await this.isWatchedDirectoryGone()) {
            // Report the changes anyway: the restart's baseline already includes them.
            this.restart();
        } else if (rescan) {
            // Rescan last, so it settles the deletions that named events deferred.
            const rescanned = await this.readChildren(this.children);
            const rescanChanges = this.diff(this.children, rescanned);
            rescanChanges.forEach(change => this.cancelDelete(change.fileName));
            changes.push(...rescanChanges);
            this.children = rescanned;
        }
        return changes;
    }

    /**
     * @returns `true` if an event names the watched directory itself rather than a child. macOS reports such an
     * event for any change inside, so {@link isWatchedDirectoryGone} decides whether the directory is gone. A
     * new child with the same name is not in {@link children} yet, so the disk rules it out.
     */
    protected async namesWatchedDirectory(fileName: string, batch: EventBatch): Promise<boolean> {
        return this.host.samePath(fileName, this.host.normalizeFileName(path.basename(this.watchedDirectory)))
            && !this.children.has(fileName)
            && await batch.storedName(fileName) !== fileName;
    }

    /** The change this rename resolves to, or `undefined` when it is deferred to the delete timer. */
    protected async resolveRename(fileName: string, batch: EventBatch): Promise<ResolvedChange | undefined> {
        const stored = await batch.storedName(fileName);
        if (stored === undefined) {
            batch.scheduleDelete(fileName);
            return undefined;
        }
        this.cancelDelete(fileName);
        if (stored === fileName) {
            return this.recordPresent(fileName);
        }
        // Only the case changed: this name is gone, but the file remains under another case.
        return this.children.delete(fileName) ? { fileName, type: FileChangeType.DELETED, pathRemains: true } : undefined;
    }

    /** Records a child found on disk: an update if it was known, an addition if not. */
    private recordPresent(fileName: string): ResolvedChange {
        if (this.children.has(fileName)) {
            return { fileName, type: FileChangeType.UPDATED };
        }
        this.children.add(fileName);
        return { fileName, type: FileChangeType.ADDED };
    }

    /** A new {@link EventBatch}. Where names ignore case, its lookups share one directory read. */
    protected createBatch(): EventBatch {
        return {
            storedName: this.host.childLookup(this.watchedDirectory),
            scheduleDelete: this.deleteScheduler()
        };
    }

    /**
     * A deletion is confirmed rather than reported right away: tools that save atomically delete and recreate
     * the file, which would otherwise surface as a deletion followed by an addition. The deletions of one batch
     * share a timer, created on first use, so that they are confirmed with one directory read as well.
     */
    private deleteScheduler(): (fileName: string) => void {
        let timer: NodeJS.Timeout | undefined;
        return fileName => {
            if (this.isDisposed || this.pendingDeletes.has(fileName)) {
                return;
            }
            if (!timer) {
                const created = setTimeout(() => this.enqueue(() => this.confirmDeletes(created)), this.timings.deleteDelay);
                timer = created;
            }
            this.pendingDeletes.set(fileName, timer);
        };
    }

    /** Leaves the shared timer running: it confirms only the names still waiting on it. */
    private cancelDelete(fileName: string): void {
        this.pendingDeletes.delete(fileName);
    }

    private clearPendingDeletes(): void {
        new Set(this.pendingDeletes.values()).forEach(timer => clearTimeout(timer));
        this.pendingDeletes.clear();
    }

    /** Confirms the deletions still waiting on `timer`. A deletion cancelled meanwhile is no longer on it. */
    protected async confirmDeletes(timer: NodeJS.Timeout): Promise<ResolvedChange[]> {
        const fileNames = Array.from(this.pendingDeletes)
            .filter(([, pending]) => pending === timer)
            .map(([fileName]) => fileName);
        fileNames.forEach(fileName => this.pendingDeletes.delete(fileName));
        const storedName = this.host.childLookup(this.watchedDirectory);
        const changes: ResolvedChange[] = [];
        for (const fileName of fileNames) {
            changes.push(...await this.confirmDelete(fileName, storedName));
        }
        return changes;
    }

    protected async confirmDelete(fileName: string, storedName: EventBatch['storedName']): Promise<ResolvedChange[]> {
        const stored = await storedName(fileName);
        if (stored === fileName) {
            return [this.recordPresent(fileName)];
        }
        const known = this.children.delete(fileName);
        return known
            ? [{ fileName, type: FileChangeType.DELETED, pathRemains: stored !== undefined }]
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
        this.pendingEvents.length = 0;
        this.scheduleFlush.cancel();
        this.changeQueue = this.changeQueue.then(async () => {
            if (token.isCancellationRequested) {
                return;
            }
            // A batch queued before the restart can still defer a deletion. The diff reports it instead.
            this.clearPendingDeletes();
            if (this.started) {
                // Taken when the restart runs rather than when it is called, so it includes the batches resolved before it.
                this.restartBaseline ??= new Set(this.children);
            }
            // A handle can also fail while the directory is untouched, and then nothing changed.
            const gone = await this.isWatchedDirectoryGone();
            if (token.isCancellationRequested) {
                return;
            }
            if (gone) {
                this.reportLoss();
            }
            // Only a comparison of the contents can recover what happened while the watcher was down.
            await this.start(token);
        }).catch(restartError => this.error(`Watcher failed to restart at "${this.target}":`, restartError));
    }

    /** Deletions come first, so a case-only rename resolves to an update for a request for the file. */
    protected diff(previous: Set<string>, current: Set<string>): ResolvedChange[] {
        const changes: ResolvedChange[] = [];
        const currentKeys = new Set(Array.from(current, fileName => this.host.pathKey(fileName)));
        for (const fileName of previous) {
            if (!current.has(fileName)) {
                changes.push({ fileName, type: FileChangeType.DELETED, pathRemains: currentKeys.has(this.host.pathKey(fileName)) });
            }
        }
        for (const fileName of current) {
            if (!previous.has(fileName)) {
                changes.push({ fileName, type: FileChangeType.ADDED });
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

    async watch(watcherId: number, request: WatchRequest): Promise<void> {
        const { directory, realPath } = await this.host.resolveTarget(request.path);
        // Nothing is awaited below, so two requests cannot both create a watcher, and no re-key can land
        // between creating one and recording the request on it.
        const watcher = this.getOrCreateWatcher(this.watcherKey(directory), () => this.createRekeyingWatcher(directory));
        const resolved: DirectoryWatchRequest = { ...request, realPath };
        this.serve(watcherId, watcher, resolved);
    }

    /** While the path does not exist, `directory` is a guess, so re-key the watcher once it resolves. */
    protected createRekeyingWatcher(directory: string): NodeDirectoryWatcher {
        const watcher = this.createWatcher(directory);
        watcher.onDidResolveDirectory(() => this.rekeyWatcher(watcher));
        return watcher;
    }

    /** Moves a watcher to the key of the directory it resolved to, or hands its requests to the one there. */
    protected rekeyWatcher(watcher: NodeDirectoryWatcher): void {
        const watcherKey = this.watcherKey(watcher.directory);
        if (watcher.isDisposed || this.isRegisteredAs(watcher, watcherKey)) {
            return;
        }
        this.unregisterWatcher(watcher);
        const target = this.getOrCreateWatcher(watcherKey, () => watcher);
        if (target !== watcher) {
            const moved = watcher.takeRequests();
            target.adoptRequests(moved);
            moved.forEach((_, movedId) => this.assign(movedId, target));
            watcher.dispose();
        }
    }

    /** Excludes are left out: one level has nothing to prune, so they apply per request. */
    protected watcherKey(directory: string): string {
        return this.host.pathKey(directory);
    }

    protected createWatcher(directory: string): NodeDirectoryWatcher {
        return new NodeDirectoryWatcher(directory, this.options, this.client, this.timings, this.host);
    }
}
