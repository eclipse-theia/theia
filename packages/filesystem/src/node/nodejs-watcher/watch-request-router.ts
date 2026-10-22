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
import { Minimatch } from 'minimatch';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { FileChangeType, FileSystemWatcherServiceClient } from '../../common/filesystem-watcher-protocol.js';
import { FileChangeCollection } from '../file-change-collection.js';
import { WatchRequest } from '../filesystem-watcher.js';
import { WatcherHost } from './watcher-host.js';

/** A {@link WatchRequest} resolved against the file system. */
export interface DirectoryWatchRequest extends WatchRequest {
    /** Where `path` points: the watched directory (every child) or one file in it. Reports use `path`. */
    readonly realPath: string;
    /** Whether the client takes `path` for existing: read when it asked, then kept to what it was last told. */
    readonly exists: boolean;
}

/** A resolved change to a direct child of the watched directory. */
export interface ResolvedChange {
    readonly fileName: string;
    readonly type: FileChangeType;
    /** Set on a deletion whose name still exists in another case. */
    readonly pathRemains?: boolean;
}

/** A change as one client will be told about it. */
interface ReportedChange {
    readonly clientId: number;
    readonly filePath: string;
    readonly type: FileChangeType;
}

/**
 * Holds the requests one watcher serves and turns resolved changes into notifications. It touches none of the
 * event state machine, and asks for the watched directory rather than storing it.
 */
export class WatchRequestRouter {

    private readonly requests = new Map<number, DirectoryWatchRequest>();
    /** Requests moved in from another watcher, which hear nothing until {@link admitAdopted}. */
    private readonly adopted = new Map<number, DirectoryWatchRequest>();
    /** Compiled excludes, shared across requests, which mostly carry the same `files.watcherExclude`. */
    private readonly matchers = new Map<string, Minimatch>();

    constructor(
        protected readonly client: FileSystemWatcherServiceClient,
        protected readonly host: WatcherHost,
        protected readonly watchedDirectory: () => string
    ) { }

    get size(): number {
        return this.requests.size + this.adopted.size;
    }

    add(watcherId: number, request: DirectoryWatchRequest): void {
        this.requests.set(watcherId, request);
    }

    /** Holds requests moved in from another watcher until {@link admitAdopted}. */
    adopt(requests: Map<number, DirectoryWatchRequest>): void {
        requests.forEach((request, watcherId) => this.adopted.set(watcherId, request));
    }

    /** @returns `true` if a request was registered under `watcherId`. */
    remove(watcherId: number): boolean {
        return this.requests.delete(watcherId) || this.adopted.delete(watcherId);
    }

    /** Drains the requests, so that they can be moved to the watcher serving their directory. */
    takeAll(): Map<number, DirectoryWatchRequest> {
        const taken = new Map([...this.requests, ...this.adopted]);
        this.requests.clear();
        this.adopted.clear();
        return taken;
    }

    /** Lets the adopted requests hear changes. */
    admitAdopted(): void {
        this.adopted.forEach((request, watcherId) => this.requests.set(watcherId, request));
        this.adopted.clear();
    }

    /** @returns a test of whether a request's path is the watched directory or one of `children`. */
    knows(children: ReadonlySet<string>): (request: DirectoryWatchRequest) => boolean {
        let childKeys: Set<string> | undefined;
        return request => {
            if (this.watchesDirectory(request)) {
                return true;
            }
            const fileName = this.childName(request);
            if (fileName === undefined || children.has(fileName)) {
                return fileName !== undefined;
            }
            // Keyed at most once per call, and only when a name ignoring case can differ from the stored one.
            childKeys ??= this.host.caseInsensitiveFileNames ? new Set(Array.from(children, child => this.host.pathKey(child))) : new Set();
            return childKeys.has(this.host.pathKey(fileName));
        };
    }

    /** @returns `true` if every request is for `fsPath` itself rather than for something inside it. */
    allFor(fsPath: string): boolean {
        return [...this.requests.values(), ...this.adopted.values()].every(request => this.host.samePath(request.realPath, fsPath));
    }

    /** @returns `true` if the request is for the watched directory, rather than for one file in it. */
    watchesDirectory(request: DirectoryWatchRequest): boolean {
        // Both sides are resolved separately, so compare them the way the host resolves names.
        return this.host.samePath(request.realPath, this.watchedDirectory());
    }

    /** Points every request made for `target` at where it resolved to, a file or a directory. */
    resolveRequests(target: string, realPath: string): void {
        for (const [watcherId, request] of this.requests) {
            if (request.path === target) {
                this.requests.set(watcherId, { ...request, realPath });
            }
        }
    }

    /** Reports changes to direct children, mapped and filtered per request. */
    report(changes: readonly ResolvedChange[]): void {
        // Keyed once per batch, so a file request looks up its own changes rather than comparing against each one.
        const changesByKey = new Map<string, ResolvedChange[]>();
        for (const change of changes) {
            const key = this.host.pathKey(change.fileName);
            let changesToChild = changesByKey.get(key);
            if (!changesToChild) {
                changesByKey.set(key, changesToChild = []);
            }
            changesToChild.push(change);
        }
        const reported: ReportedChange[] = [];
        for (const [watcherId, request] of this.requests) {
            if (this.watchesDirectory(request)) {
                for (const { fileName, type } of changes) {
                    const childPath = path.resolve(request.path, fileName);
                    if (!this.isIgnored(request, childPath)) {
                        reported.push({ clientId: request.clientId, filePath: childPath, type });
                    }
                }
                continue;
            }
            const ownName = this.childName(request);
            // Excludes filter children, never the path a client explicitly asked to watch.
            for (const { type, pathRemains } of ownName === undefined ? [] : changesByKey.get(this.host.pathKey(ownName)) ?? []) {
                this.tell(reported, watcherId, pathRemains ? FileChangeType.UPDATED : type);
            }
        }
        this.emit(reported);
    }

    /** Tells each request where `exists` differs from what it takes its own path for, so it hears of a loss or a recovery once. */
    reconcile(exists: (request: DirectoryWatchRequest) => boolean): void {
        const reported: ReportedChange[] = [];
        for (const [watcherId, request] of this.requests) {
            this.tell(reported, watcherId, exists(request) ? FileChangeType.ADDED : FileChangeType.DELETED);
        }
        this.emit(reported);
    }

    /** Adds a change to a request's own path, unless the client already takes the path for what it reports. */
    private tell(reported: ReportedChange[], watcherId: number, type: FileChangeType): void {
        const request = this.requests.get(watcherId)!;
        if (type !== FileChangeType.UPDATED) {
            const exists = type === FileChangeType.ADDED;
            if (request.exists === exists) {
                return;
            }
            this.requests.set(watcherId, { ...request, exists });
        }
        reported.push({ clientId: request.clientId, filePath: request.path, type });
    }

    /** Notifies each client once per watched path, so overlapping requests do not report twice. */
    private emit(reported: readonly ReportedChange[]): void {
        if (reported.length === 0) {
            return;
        }
        const perClient = new Map<number, FileChangeCollection>();
        for (const { clientId, filePath, type } of reported) {
            let collection = perClient.get(clientId);
            if (!collection) {
                perClient.set(clientId, collection = new FileChangeCollection());
            }
            collection.push({ uri: FileUri.create(filePath).toString(), type });
        }
        for (const [clientId, collection] of perClient) {
            this.client.onDidFilesChanged({ clients: [clientId], changes: collection.values() });
        }
    }

    /** The name of the child a file request is for, or `undefined` if its path is not in the watched directory. */
    protected childName(request: DirectoryWatchRequest): string | undefined {
        const fileName = this.host.normalizeFileName(path.basename(request.realPath));
        return this.host.samePath(path.resolve(this.watchedDirectory(), fileName), request.realPath) ? fileName : undefined;
    }

    protected isIgnored(request: DirectoryWatchRequest, changed: string): boolean {
        return request.ignored.some(pattern => this.matcher(pattern).match(changed));
    }

    private matcher(pattern: string): Minimatch {
        let matcher = this.matchers.get(pattern);
        if (!matcher) {
            this.matchers.set(pattern, matcher = new Minimatch(pattern, { dot: true }));
        }
        return matcher;
    }
}
