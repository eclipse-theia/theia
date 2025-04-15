// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { DisposableCollection, EOL, Path, URI, unreachable } from '@theia/core';
import { ChatService, ChatSession } from '../common';
import { PreferenceService } from '@theia/core/lib/browser';
import { ChatSessionSummaryAgent } from '../common/chat-session-summary-agent';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TASK_CONTEXT_STORAGE_DIRECTORY_PREF } from './ai-chat-preferences';
import { load, dump } from 'js-yaml';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileChange, FileChangeType } from '@theia/filesystem/lib/common/files';

@injectable()
export class TaskContextService {
    protected summaries = new Map<string, { label: string; summary: string, uri?: URI }>();
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(ChatService) protected readonly chatService: ChatService;
    @inject(ChatSessionSummaryAgent) protected readonly summaryAgent: ChatSessionSummaryAgent;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected init(): void {
        this.watchStorage();
        this.preferenceService.onPreferenceChanged(e => {
            if (e.affects(TASK_CONTEXT_STORAGE_DIRECTORY_PREF)) { this.watchStorage(); }
        });
    }

    protected toDisposeOnStorageChange?: DisposableCollection;
    protected async watchStorage(): Promise<void> {
        this.toDisposeOnStorageChange?.dispose();
        this.toDisposeOnStorageChange = undefined;
        const newStorage = this.getStorageLocation();
        if (!newStorage) { return; }
        this.toDisposeOnStorageChange = new DisposableCollection(
            this.fileService.watch(newStorage),
            this.fileService.onDidFilesChange(event => {
                const relevantChanges = event.changes.filter(candidate => newStorage.isEqualOrParent(candidate.resource));
                this.handleChanges(relevantChanges);
            }),
            { dispose: () => this.clearFileReferences() },
        );
        await this.cacheNewTasks(newStorage);
    }

    protected clearFileReferences(): void {
        for (const [key, value] of this.summaries.entries()) {
            if (value.uri) {
                this.summaries.delete(key);
            }
        }
    }

    protected getStorageLocation(): URI | undefined {
        if (!this.workspaceService.opened) { return; }
        const configuredPath = this.preferenceService.inspect(TASK_CONTEXT_STORAGE_DIRECTORY_PREF)?.globalValue;
        if (!configuredPath || typeof configuredPath !== 'string') { return; }
        const asPath = new Path(configuredPath);
        return asPath.isAbsolute ? new URI(configuredPath) : this.workspaceService.tryGetRoots().at(0)?.resource.resolve(configuredPath);
    }

    protected async cacheNewTasks(storageLocation: URI): Promise<void> {
        const contents = await this.fileService.resolve(storageLocation).catch(() => undefined);
        if (!contents?.children?.length) { return; }
        await Promise.all(contents.children.map(child => this.readFile(child.resource)));
    }

    protected async handleChanges(changes: FileChange[]): Promise<void> {
        await Promise.all(changes.map(change => {
            switch (change.type) {
                case FileChangeType.DELETED: return this.summaries.delete(change.resource.path.base);
                case FileChangeType.ADDED:
                case FileChangeType.UPDATED:
                    return this.readFile(change.resource);
                default: return unreachable(change.type);
            }
        }));
    }

    getSummaries(): Array<{ id: string, label: string, summary: string }> {
        return Array.from(this.summaries.entries(), ([id, { label, summary }]) => ({ id, label, summary }));
    }

    hasSummary(id: string): boolean {
        return this.summaries.has(id);
    }

    async getSummary(sessionIdOrFilePath: string): Promise<string> {
        const existing = this.summaries.get(sessionIdOrFilePath);
        if (existing) { return existing.summary; }
        const session = this.chatService.getSession(sessionIdOrFilePath);
        if (session) {
            return this.summarizeAndStore(session);
        }
        throw new Error('Unable to resolve summary request.');
    }

    protected async summarizeAndStore(session: ChatSession): Promise<string> {
        const summary = await this.summaryAgent.generateChatSessionSummary(session);
        const storageLocation = this.getStorageLocation();
        if (storageLocation) {
            const frontmatter = {
                session: session.id,
                date: new Date().toISOString(),
                label: session.title || undefined,
            };
            const content = dump(frontmatter) + `${EOL}---${EOL}` + summary;
            const derivedName = (session.title || session.id).replace(/\W/g, '-').replace(/-+/g, '-');
            const filename = (derivedName.length > 32 ? derivedName.slice(0, derivedName.indexOf('-', 32)) : derivedName) + '.md';
            const uri = storageLocation.resolve(filename);
            await this.fileService.writeFile(uri, BinaryBuffer.fromString(content));
            this.summaries.set(filename, { label: session.title || session.id, summary, uri });
        } else {
            this.summaries.set(session.id, { label: session.title || session.id, summary });
        }
        return summary;
    }

    protected async readFile(uri: URI): Promise<void> {
        const content = await this.fileService.read(uri).then(read => read.value).catch(() => undefined);
        if (!content) { return; }
        const { frontmatter, body } = this.maybeReadFrontmatter(content);
        this.summaries.set(uri.path.base, { summary: body, label: frontmatter?.label || uri.path.base, uri });
    }

    protected maybeReadFrontmatter(content: string): { body: string, frontmatter: { label: string } | undefined } {
        const frontmatterEnd = content.indexOf('---');
        if (frontmatterEnd !== -1) {
            try {
                const frontmatter = load(content.slice(0, frontmatterEnd));
                if (this.hasLabel(frontmatter)) {
                    return { frontmatter, body: content.slice(frontmatterEnd + 3).trim() };
                }
            } catch { /* Probably not frontmatter, then. */ }
        }
        return { body: content, frontmatter: undefined };
    }

    protected hasLabel(candidate: unknown): candidate is { label: string } {
        return !!candidate && typeof candidate === 'object' && !Array.isArray(candidate) && 'label' in candidate && typeof candidate.label === 'string';
    }


    getLabel(id: string): string | undefined {
        return this.summaries.get(id)?.label;
    }
}
