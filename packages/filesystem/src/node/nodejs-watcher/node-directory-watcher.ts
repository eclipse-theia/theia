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

import * as path from 'path';
import { FSWatcher, promises as fsp, watch } from 'fs';
import { Minimatch } from 'minimatch';
import { isOSX, isWindows } from '@theia/core';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { Deferred, timeout } from '@theia/core/lib/common/promise-util';
import { FileChangeType, FileSystemWatcherServiceClient } from '../../common/filesystem-watcher-protocol';
import { FileChangeCollection } from '../file-change-collection';

export interface NodeDirectoryWatcherOptions {
    verbose: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    info: (message: string, ...args: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error: (message: string, ...args: any[]) => void;
}

/**
 * A single client request served by a {@link NodeDirectoryWatcher}.
 */
export interface NodeWatchRequest {
    /** Client to route the changes of this request to. */
    clientId: number;
    /** Absolute path as requested by the client. Change URIs are built from it, never from the real path. */
    path: string;
    /** Name of the single file this request is interested in, or `undefined` to watch the whole directory. */
    fileName?: string;
    /** Exclude patterns of this request alone. */
    ignored: Minimatch[];
}

export type WatchEventListener = (eventType: string, fileName: string | null) => void;

export interface NodeDirectoryWatcherTimings {
    /** Aggregation window before a batch of raw events is resolved against the file system. */
    changeDelay: number;
    /** Grace period before a deletion is confirmed, so that an atomic save is not reported as one. */
    deleteDelay: number;
    /** Interval at which a path that does not exist yet is polled for. */
    existencePollDelay: number;
    /** Time a watcher without requests is kept around, so that a reconnecting frontend can reuse it. */
    deferredDisposalTimeout: number;
}

export const DEFAULT_WATCHER_TIMINGS: NodeDirectoryWatcherTimings = {
    changeDelay: 75,
    deleteDelay: 100,
    existencePollDelay: 500,
    deferredDisposalTimeout: 10_000
};

/** A change resolved against the file system: a direct child of the watched directory, or the watched path itself. */
interface ResolvedChange {
    fileName?: string;
    type: FileChangeType;
}

export interface DirectoryIdentity {
    dev: number;
    ino: number;
    birthtimeMs: number;
}

interface PendingEvent {
    eventType: string;
    fileName: string | undefined;
}

/**
 * Watches one directory level with Node's `fs.watch`.
 *
 * One instance serves every non-recursive request that resolves to the same directory, be it a request for the
 * directory itself or for a single file inside it. Sharing matters beyond saving handles: on macOS libuv keeps a
 * single `FSEventStream` per event loop and destroys and recreates it whenever any handle starts or stops, losing
 * the events of every other watcher while it does.
 */
export class NodeDirectoryWatcher {

    protected static debugIdSequence = 0;

    protected readonly debugId = NodeDirectoryWatcher.debugIdSequence++;
    protected readonly requests = new Map<number, NodeWatchRequest>();
    protected readonly pendingEvents: PendingEvent[] = [];
    protected readonly pendingDeletes = new Map<string, NodeJS.Timeout>();
    protected readonly disposalDeferred = new Deferred<void>();

    /** Direct children of {@link watchedDirectory}, kept in sync to classify changes and to recover from a rescan. */
    protected children = new Set<string>();
    protected watchedDirectory: string;
    protected identity: DirectoryIdentity | undefined;
    protected handle: FSWatcher | undefined;
    protected changeQueue: Promise<void> = Promise.resolve();
    protected changeTimer: NodeJS.Timeout | undefined;
    protected disposalTimer: NodeJS.Timeout | undefined;
    protected restarting = false;
    protected disposed = false;

    /** Resolves once this watcher disposed itself and its resources. Never rejects. */
    readonly whenDisposed = this.disposalDeferred.promise;

    /** Resolves once the watcher is up, or once it got disposed while starting. Never rejects. */
    readonly whenStarted: Promise<void>;

    constructor(
        /**
         * Path the watched directory is derived from. It is the directory itself, or, while the path does not
         * exist yet, a guess that {@link resolveTarget} corrects once it appears.
         */
        readonly target: string,
        protected readonly options: NodeDirectoryWatcherOptions,
        protected readonly client: FileSystemWatcherServiceClient,
        protected readonly timings: NodeDirectoryWatcherTimings = DEFAULT_WATCHER_TIMINGS
    ) {
        this.watchedDirectory = target;
        this.whenStarted = this.start().catch(error => this.options.error(`Watcher failed to start at "${this.target}":`, error));
    }

    get isDisposed(): boolean {
        return this.disposed;
    }

    isInUse(): boolean {
        return this.requests.size > 0;
    }

    addRequest(watcherId: number, request: NodeWatchRequest): void {
        this.requests.set(watcherId, request);
        clearTimeout(this.disposalTimer);
        this.disposalTimer = undefined;
        this.debug('REQUEST++', `watcherId=${watcherId}, requests=${this.requests.size}`);
    }

    removeRequest(watcherId: number): void {
        if (!this.requests.delete(watcherId)) {
            this.options.info(`WARN REQUEST-- NodeDirectoryWatcher(${this.debugId}): unknown watcherId=${watcherId}`);
            return;
        }
        if (this.requests.size === 0) {
            this.disposalTimer = setTimeout(() => this.dispose(), this.timings.deferredDisposalTimeout);
        }
        this.debug('REQUEST--', `watcherId=${watcherId}, requests=${this.requests.size}`);
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.closeHandle();
        this.clearPendingDeletes();
        clearTimeout(this.changeTimer);
        this.changeTimer = undefined;
        clearTimeout(this.disposalTimer);
        this.disposalTimer = undefined;
        this.disposalDeferred.resolve();
        this.debug('DISPOSED');
    }

    /**
     * Waits for the target to exist, then opens the handle before reading the children, so that changes made
     * while the directory is read are not missed.
     */
    protected async start(missing = false): Promise<void> {
        const previousChildren = this.restarting ? this.children : undefined;
        const wasMissing = await this.openWhenAvailable() || missing;
        if (this.disposed) {
            return;
        }
        await this.takeSnapshot();
        this.restarting = false;
        this.debug('STARTED', this.watchedDirectory);
        if (wasMissing) {
            this.report([{ type: FileChangeType.ADDED }], await this.existingRequests());
        }
        if (previousChildren) {
            // Whatever happened while the directory was gone can only be recovered by comparing its contents.
            this.report(this.diff(previousChildren, this.children));
        }
    }

    /** Polls until the target exists and a handle is open on it. Resolves to whether the target was ever missing. */
    protected async openWhenAvailable(): Promise<boolean> {
        let wasMissing = false;
        while (!this.disposed) {
            if (!await this.exists(this.target)) {
                wasMissing = true;
            } else {
                await this.resolveTarget();
                if (this.disposed || this.openHandle()) {
                    break;
                }
            }
            await timeout(this.timings.existencePollDelay);
        }
        return wasMissing;
    }

    /** Records what changes are resolved against: the children of the watched directory, and its identity. */
    protected async takeSnapshot(): Promise<void> {
        const children = await this.readChildren();
        // Anything reported while the directory was being read counts as new rather than as modified.
        for (const event of this.pendingEvents) {
            if (event.fileName) {
                children.delete(event.fileName);
            }
        }
        this.children = children;
        this.identity = await this.readIdentity();
    }

    /** The requests whose own path exists, so that a recovered directory does not announce files that are still gone. */
    protected async existingRequests(): Promise<NodeWatchRequest[]> {
        const requests = Array.from(this.requests.values());
        const existing = await Promise.all(requests.map(request => this.exists(request.path)));
        return requests.filter((request, index) => existing[index]);
    }

    /**
     * Applies {@link NodeDirectoryWatcher.resolveTarget} to this watcher. A target that only turns out to be a
     * file once it appears was requested as a directory, so its requests are narrowed to that file here.
     */
    protected async resolveTarget(): Promise<void> {
        const { directory, fileName } = await NodeDirectoryWatcher.resolveTarget(this.target);
        this.watchedDirectory = directory;
        if (fileName !== undefined) {
            for (const request of this.requests.values()) {
                if (request.path === this.target) {
                    request.fileName = fileName;
                }
            }
        }
    }

    protected openHandle(): boolean {
        try {
            this.handle = this.createWatchHandle(this.watchedDirectory, (eventType, fileName) => this.handleEvent(eventType, fileName));
            this.handle.on('error', error => this.restart(error));
            return true;
        } catch (error) {
            this.debug('OPEN FAILED', error);
            return false;
        }
    }

    protected createWatchHandle(directory: string, listener: WatchEventListener): FSWatcher {
        return watch(directory, { recursive: false }, listener);
    }

    protected closeHandle(): void {
        if (this.handle) {
            this.handle.removeAllListeners();
            this.handle.close();
            this.handle = undefined;
        }
    }

    protected handleEvent(eventType: string, fileName: string | null): void {
        if (this.disposed) {
            return;
        }
        // Windows reports a `ReadDirectoryChangesW` buffer overflow as a change without a file name; the events
        // lost with it can only be recovered by rescanning the directory.
        this.pendingEvents.push({ eventType, fileName: fileName ? this.normalizeFileName(fileName) : undefined });
        if (!this.changeTimer) {
            this.changeTimer = setTimeout(() => this.flush(), this.timings.changeDelay);
        }
    }

    protected flush(): void {
        this.changeTimer = undefined;
        const events = this.pendingEvents.splice(0);
        this.enqueue(() => this.processEvents(events));
    }

    /** Serializes the asynchronous parts of change handling so that later events cannot overtake earlier ones. */
    protected enqueue(task: () => Promise<void>): void {
        this.changeQueue = this.changeQueue.then(async () => {
            if (!this.disposed && this.isInUse()) {
                await task();
            }
        }, error => this.options.error(`Watcher failed to process changes at "${this.watchedDirectory}":`, error));
    }

    protected async processEvents(events: PendingEvent[]): Promise<void> {
        const changes: ResolvedChange[] = [];
        let renamed = false;
        for (const { eventType, fileName } of events) {
            if (fileName === undefined) {
                const rescanned = await this.readChildren();
                const rescanChanges = this.diff(this.children, rescanned);
                // Reading the directory settles what a pending deletion was waiting to find out.
                rescanChanges.forEach(change => this.cancelDelete(change.fileName));
                changes.push(...rescanChanges);
                this.children = rescanned;
            } else if (fileName.includes('/') || fileName.includes('\\')) {
                continue;
            } else if (eventType === 'rename') {
                renamed = true;
                await this.resolveRename(fileName, changes);
            } else {
                changes.push({ fileName, type: FileChangeType.UPDATED });
            }
        }
        if (renamed && await this.isWatchedDirectoryGone()) {
            this.restart();
            return;
        }
        this.report(changes);
    }

    protected async resolveRename(fileName: string, changes: ResolvedChange[]): Promise<void> {
        if (!await this.exists(path.resolve(this.watchedDirectory, fileName))) {
            // Losing the watched directory is reported under its own name, and there is no such child to report.
            if (!this.children.has(fileName) && fileName === path.basename(this.watchedDirectory)) {
                return;
            }
            this.scheduleDelete(fileName);
            return;
        }
        this.cancelDelete(fileName);
        if (this.children.has(fileName)) {
            changes.push({ fileName, type: FileChangeType.UPDATED });
        } else {
            this.children.add(fileName);
            changes.push({ fileName, type: FileChangeType.ADDED });
        }
    }

    /**
     * A deletion is confirmed rather than reported right away: tools that save atomically delete and recreate a
     * file, which would otherwise surface as a deletion followed by an addition.
     */
    protected scheduleDelete(fileName: string): void {
        if (this.pendingDeletes.has(fileName)) {
            return;
        }
        this.pendingDeletes.set(fileName, setTimeout(() => {
            this.pendingDeletes.delete(fileName);
            this.enqueue(() => this.confirmDelete(fileName));
        }, this.timings.deleteDelay));
    }

    protected cancelDelete(fileName: string): void {
        clearTimeout(this.pendingDeletes.get(fileName));
        this.pendingDeletes.delete(fileName);
    }

    protected clearPendingDeletes(): void {
        for (const timer of this.pendingDeletes.values()) {
            clearTimeout(timer);
        }
        this.pendingDeletes.clear();
    }

    protected async confirmDelete(fileName: string): Promise<void> {
        const known = this.children.has(fileName);
        if (await this.exists(path.resolve(this.watchedDirectory, fileName))) {
            this.children.add(fileName);
            this.report([{ fileName, type: known ? FileChangeType.UPDATED : FileChangeType.ADDED }]);
            return;
        }
        this.children.delete(fileName);
        this.report(known
            ? [{ fileName, type: FileChangeType.DELETED }]
            // The file appeared and vanished within the delay, so report both rather than a deletion out of thin air.
            : [{ fileName, type: FileChangeType.ADDED }, { fileName, type: FileChangeType.DELETED }]);
    }

    /**
     * Compares the identity of the watched directory rather than its mere existence: a directory that is deleted
     * and recreated leaves the handle bound to the old inode, where it would never report anything again.
     */
    protected async isWatchedDirectoryGone(): Promise<boolean> {
        const identity = await this.readIdentity();
        if (!identity) {
            return true;
        }
        return this.identity !== undefined && (identity.dev !== this.identity.dev
            || identity.ino !== this.identity.ino
            || identity.birthtimeMs !== this.identity.birthtimeMs);
    }

    /** Closes the handle and starts over, reporting the watched paths as deleted when the directory is gone. */
    protected restart(error?: unknown): void {
        if (this.disposed || this.restarting) {
            return;
        }
        this.restarting = true;
        this.debug('RESTART', error ?? '');
        this.closeHandle();
        this.clearPendingDeletes();
        this.pendingEvents.length = 0;
        clearTimeout(this.changeTimer);
        this.changeTimer = undefined;
        this.changeQueue = this.changeQueue.then(async () => {
            if (this.disposed) {
                return;
            }
            // A handle can also fail while the directory is untouched, and then nothing has changed to report.
            const gone = await this.isWatchedDirectoryGone();
            if (gone) {
                // Losing the directory takes every requested path inside it along.
                this.report([{ type: FileChangeType.DELETED }]);
            }
            await this.start(gone);
        }, restartError => this.options.error(`Watcher failed to restart at "${this.target}":`, restartError));
    }

    /**
     * Notifies each client once per path it watches that changed, so that a client holding overlapping requests
     * does not hear about the same change twice.
     */
    protected report(changes: ResolvedChange[], requests: Iterable<NodeWatchRequest> = this.requests.values()): void {
        if (this.disposed || changes.length === 0) {
            return;
        }
        const perClient = new Map<number, FileChangeCollection>();
        for (const request of requests) {
            for (const { fileName, type } of changes) {
                const changed = this.resolveRequestPath(request, fileName);
                if (changed && !request.ignored.some(pattern => pattern.match(changed))) {
                    let collection = perClient.get(request.clientId);
                    if (!collection) {
                        perClient.set(request.clientId, collection = new FileChangeCollection());
                    }
                    collection.push({ uri: FileUri.create(changed).toString(), type });
                }
            }
        }
        for (const [clientId, collection] of perClient) {
            this.client.onDidFilesChanged({ clients: [clientId], changes: collection.values() });
        }
    }

    /** The path a request reports a change under, or `undefined` when the change is none of its business. */
    protected resolveRequestPath(request: NodeWatchRequest, fileName?: string): string | undefined {
        if (fileName === undefined) {
            return request.path;
        }
        if (request.fileName === undefined) {
            return path.resolve(request.path, fileName);
        }
        return this.sameFileName(request.fileName, fileName) ? request.path : undefined;
    }

    protected diff(previous: Set<string>, current: Set<string>): Required<ResolvedChange>[] {
        const changes: Required<ResolvedChange>[] = [];
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

    protected async readChildren(): Promise<Set<string>> {
        const children = await fsp.readdir(this.watchedDirectory).catch(() => []);
        return new Set(children.map(fileName => this.normalizeFileName(fileName)));
    }

    protected async readIdentity(): Promise<DirectoryIdentity | undefined> {
        const stat = await fsp.stat(this.watchedDirectory).catch(() => undefined);
        // The inode number alone is not enough: deleting a directory frees it for the one that takes its place.
        return stat && { dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs };
    }

    protected exists(fsPath: string): Promise<boolean> {
        return fsp.stat(fsPath).then(() => true, () => false);
    }

    /** macOS reports decomposed file names, which would not match a composed path the client asked to watch. */
    protected get decomposesFileNames(): boolean {
        return isOSX;
    }

    protected get caseSensitiveFileNames(): boolean {
        return !isWindows && !isOSX;
    }

    protected normalizeFileName(fileName: string): string {
        return this.decomposesFileNames ? fileName.normalize('NFC') : fileName;
    }

    protected sameFileName(expected: string, actual: string): boolean {
        return this.caseSensitiveFileNames ? expected === actual : expected.toLowerCase() === actual.toLowerCase();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected debug(prefix: string, ...params: any[]): void {
        if (this.options.verbose) {
            this.options.info(`${prefix} NodeDirectoryWatcher(${this.debugId} at "${this.target}"):`, ...params);
        }
    }
}

export namespace NodeDirectoryWatcher {

    /** The directory a requested path is watched through, and the name of the single file to report, if it is one. */
    export interface Target {
        directory: string;
        fileName?: string;
    }

    /**
     * A file is watched through its parent directory, which is also how a file that is deleted and recreated stays
     * observable. A path that does not exist yet is assumed to be a directory, which {@link NodeDirectoryWatcher}
     * corrects once it appears. The real path is resolved because on macOS FSEvents reports real paths, and libuv
     * drops what it cannot match against the path it registered.
     */
    export async function resolveTarget(fsPath: string): Promise<Target> {
        const realPath = await fsp.realpath(fsPath).catch(() => fsPath);
        const stat = await fsp.stat(realPath).catch(() => undefined);
        return stat?.isFile()
            ? { directory: path.dirname(realPath), fileName: path.basename(realPath) }
            : { directory: realPath };
    }
}
