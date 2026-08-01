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

import { Event, URI } from '@theia/core';
import { LabelProvider } from '@theia/core/lib/browser';
import { hash } from '@theia/core/lib/common/hash';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileChangesEvent } from '@theia/filesystem/lib/common/files';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { FileReadTracker } from '../common/file-read-tracker';

/** The content an agent saw, and whether anything has since signalled a possible change. */
interface TrackedFile {
    seenHash: number;
    maybeStale: boolean;
}

@injectable()
export class FileReadTrackerImpl implements FileReadTracker {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(MonacoWorkspace)
    protected readonly monacoWorkspace: MonacoWorkspace;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    /** Session id -> tracked file uri -> state. Both levels are insertion ordered and bounded. */
    protected readonly sessions = new Map<string, Map<string, TrackedFile>>();

    /**
     * Arbitrary bounds. Sessions are never disposed here, as that would mean depending on the `ChatService`
     * that owns the agents using this service, so the least recently used are evicted; that only loses a notice.
     */
    protected readonly maxSessions: number = 32;
    protected readonly maxFilesPerSession: number = 200;

    /** A file grown past this is reported as changed and dropped instead of read to compare. The read tools hand an agent far less. */
    protected readonly maxComparedFileSize: number = 4 * 1024 * 1024;

    /** Only flags entries; reading and hashing happens in {@link isStale} and {@link getChangedFiles}. */
    @postConstruct()
    protected init(): void {
        this.fileChanges(event => this.handleFileChanges(event));
        this.documentChanges(uri => this.invalidate(uri));
    }

    protected get fileChanges(): Event<FileChangesEvent> {
        return this.fileService.onDidFilesChange;
    }

    /** Uris of documents whose unsaved content changed, which never reaches the file system. */
    protected get documentChanges(): Event<string> {
        return Event.map(this.monacoWorkspace.onDidChangeTextDocument, event => event.model.uri);
    }

    async recordRead(sessionId: string, uri: URI, content?: string): Promise<void> {
        const key = uri.toString();
        const current = content ?? await this.resolveContent(uri);
        if (current === undefined) {
            this.sessions.get(sessionId)?.delete(key);
            return;
        }
        const files = this.touchSession(sessionId);
        // Re-insert to move the key last, so eviction drops the least recently used.
        files.delete(key);
        files.set(key, { seenHash: hash(current), maybeStale: false });
        this.evictOverflow(files, this.maxFilesPerSession);
    }

    async isStale(sessionId: string, uri: URI): Promise<boolean> {
        const files = this.sessions.get(sessionId);
        if (!files) {
            return false;
        }
        const key = uri.toString();
        const tracked = files.get(key);
        if (!tracked?.maybeStale) {
            return false;
        }
        return await this.recheck(files, key, tracked) === 'changed';
    }

    async getChangedFiles(sessionId: string): Promise<string[]> {
        const files = this.sessions.get(sessionId);
        if (!files) {
            return [];
        }
        const labels = await Promise.all([...files]
            .filter(([, tracked]) => tracked.maybeStale)
            .map(async ([key, tracked]) => await this.recheck(files, key, tracked) === 'unchanged' ? undefined : this.getLabel(new URI(key))));
        return labels.filter((label): label is string => label !== undefined);
    }

    /**
     * Flags the tracked files the event touched, by uri lookup rather than {@link FileChangesEvent.contains},
     * which scans the whole change list. A deleted parent folder is therefore only noticed on the next read.
     */
    protected handleFileChanges(event: FileChangesEvent): void {
        for (const change of event.changes) {
            this.invalidate(change.resource.toString());
        }
    }

    /** Compares a flagged file against what the agent saw, clearing the flag when the contents match again. */
    protected async recheck(files: Map<string, TrackedFile>, key: string, tracked: TrackedFile): Promise<'unchanged' | 'changed' | 'gone'> {
        const current = await this.resolveContent(new URI(key));
        if (current === undefined) {
            files.delete(key);
            return 'gone';
        }
        if (hash(current) === tracked.seenHash) {
            tracked.maybeStale = false;
            return 'unchanged';
        }
        return 'changed';
    }

    /** `undefined` when the content cannot be resolved at all, which both callers treat as gone. */
    protected async resolveContent(uri: URI): Promise<string | undefined> {
        try {
            return await this.readCurrentContent(uri);
        } catch {
            return undefined;
        }
    }

    /** The content the agent would be handed now, preferring the open editor document as `getFileContent` does. */
    protected async readCurrentContent(uri: URI): Promise<string> {
        const document = this.monacoWorkspace.getTextDocument(uri.toString());
        if (document) {
            return document.getText();
        }
        return (await this.fileService.readFile(uri, { limits: { size: this.maxComparedFileSize } })).value.toString();
    }

    /** A path the agent can pass back to `getFileContent`. */
    protected getLabel(uri: URI): string {
        return this.labelProvider.getLongName(uri);
    }

    protected invalidate(uriString: string): void {
        for (const files of this.sessions.values()) {
            const tracked = files.get(uriString);
            if (tracked) {
                tracked.maybeStale = true;
            }
        }
    }

    protected touchSession(sessionId: string): Map<string, TrackedFile> {
        const files = this.sessions.get(sessionId) ?? new Map<string, TrackedFile>();
        // Re-insert to move the key last, so eviction drops the least recently used.
        this.sessions.delete(sessionId);
        this.sessions.set(sessionId, files);
        this.evictOverflow(this.sessions, this.maxSessions);
        return files;
    }

    /** Drops entries from the front, which insertion order makes the least recently used ones. */
    protected evictOverflow(entries: Map<string, unknown>, limit: number): void {
        for (const key of entries.keys()) {
            if (entries.size <= limit) {
                return;
            }
            entries.delete(key);
        }
    }
}
