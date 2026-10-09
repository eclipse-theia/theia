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
import { FileChangeType, FileSystemWatcherServiceClient } from '../../common/filesystem-watcher-protocol';
import { FileChangeCollection } from '../file-change-collection';
import { WatchRequest } from '../filesystem-watcher';
import { WatcherHost } from './watcher-host';

/** A {@link WatchRequest} resolved against the file system. */
export interface DirectoryWatchRequest extends WatchRequest {
    /** Where `path` points: the watched directory (every child) or one file in it. Reports use `path`. */
    readonly realPath: string;
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

    /** Lets the adopted requests hear changes and, if `report` is set, reports their path added where it exists. */
    admitAdopted(children: ReadonlySet<string>, report: boolean): void {
        if (report) {
            this.reportWatchedPath(FileChangeType.ADDED, Array.from(this.adopted.values()).filter(request => this.knows(request, children)));
        }
        this.adopted.forEach((request, watcherId) => this.requests.set(watcherId, request));
        this.adopted.clear();
    }

    /** @returns `true` if the request's path is the watched directory or one of `children`. */
    knows(request: DirectoryWatchRequest, children: ReadonlySet<string>): boolean {
        return this.watchesDirectory(request) || Array.from(children).some(fileName => this.resolveChildPath(request, fileName));
    }

    /** @returns `true` if every request is for `fsPath` itself rather than for something inside it. */
    allFor(fsPath: string): boolean {
        return [...this.requests.values(), ...this.adopted.values()].every(request => this.host.samePath(request.realPath, fsPath));
    }

    /** The requests that `include` accepts. */
    matching(include: (request: DirectoryWatchRequest) => boolean): DirectoryWatchRequest[] {
        return Array.from(this.requests.values()).filter(include);
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

    /** Reports changes to direct children, mapped and filtered per request, to the requests `include` accepts. */
    report(changes: readonly ResolvedChange[], include: (request: DirectoryWatchRequest) => boolean = () => true): void {
        const reported: ReportedChange[] = [];
        for (const request of this.matching(include)) {
            for (const { fileName, type, pathRemains } of changes) {
                const childPath = this.resolveChildPath(request, fileName);
                // Excludes filter children, never the path a client explicitly asked to watch.
                if (childPath && (childPath === request.path || !this.isIgnored(request, childPath))) {
                    reported.push({ clientId: request.clientId, filePath: childPath, type: pathRemains && !this.watchesDirectory(request) ? FileChangeType.UPDATED : type });
                }
            }
        }
        this.emit(reported);
    }

    /** Reports a change to the watched path itself, which each request hears about under its own path. */
    reportWatchedPath(type: FileChangeType, requests: Iterable<DirectoryWatchRequest> = this.requests.values()): void {
        this.emit(Array.from(requests, request => ({ clientId: request.clientId, filePath: request.path, type })));
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

    /** The path a request reports a child change under, or `undefined` if the request does not cover the child. */
    protected resolveChildPath(request: DirectoryWatchRequest, fileName: string): string | undefined {
        if (this.watchesDirectory(request)) {
            return path.resolve(request.path, fileName);
        }
        return this.host.samePath(path.resolve(this.watchedDirectory(), fileName), request.realPath) ? request.path : undefined;
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
