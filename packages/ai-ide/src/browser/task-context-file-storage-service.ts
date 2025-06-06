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

import { Summary, SummaryMetadata, TaskContextStorageService } from '@theia/ai-chat/lib/browser/task-context-service';
import { InMemoryTaskContextStorage } from '@theia/ai-chat/lib/browser/task-context-storage-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { DisposableCollection, EOL, Emitter, ILogger, Path, URI, unreachable } from '@theia/core';
import { PreferenceService, OpenerService, open } from '@theia/core/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import * as yaml from 'js-yaml';
import { FileChange, FileChangeType } from '@theia/filesystem/lib/common/files';
import { TASK_CONTEXT_STORAGE_DIRECTORY_PREF } from './workspace-preferences';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';

@injectable()
export class TaskContextFileStorageService implements TaskContextStorageService {
    @inject(InMemoryTaskContextStorage) protected readonly inMemoryStorage: InMemoryTaskContextStorage;
    @inject(PreferenceService) protected readonly preferenceService: PreferenceService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(FileService) protected readonly fileService: FileService;
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(ILogger) protected readonly logger: ILogger;
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;

    protected sanitizeLabel(label: string): string {
        return label.replace(/^[^\p{L}\p{N}]+/vg, '');
    }

    protected async getStorageLocation(): Promise<URI | undefined> {
        await this.workspaceService.ready;
        if (!this.workspaceService.opened) { return; }
        const values = this.preferenceService.inspect(TASK_CONTEXT_STORAGE_DIRECTORY_PREF);
        const configuredPath = values?.globalValue === undefined ? values?.defaultValue : values?.globalValue;
        if (!configuredPath || typeof configuredPath !== 'string') { return; }
        const asPath = new Path(configuredPath);
        return asPath.isAbsolute ? new URI(configuredPath) : this.workspaceService.tryGetRoots().at(0)?.resource.resolve(configuredPath);
    }

    @postConstruct()
    protected init(): void {
        this.watchStorage().catch(error => this.logger.error(error));
        this.preferenceService.onPreferenceChanged(e => {
            if (e.affects(TASK_CONTEXT_STORAGE_DIRECTORY_PREF)) {
                this.watchStorage().catch(error => this.logger.error(error));
            }
        });
    }

    protected toDisposeOnStorageChange?: DisposableCollection;
    protected async watchStorage(): Promise<void> {
        this.toDisposeOnStorageChange?.dispose();
        this.toDisposeOnStorageChange = undefined;
        const newStorage = await this.getStorageLocation();
        if (!newStorage) { return; }
        this.toDisposeOnStorageChange = new DisposableCollection(
            this.fileService.watch(newStorage, { recursive: true, excludes: [] }),
            this.fileService.onDidFilesChange(event => {
                const relevantChanges = event.changes.filter(candidate => newStorage.isEqualOrParent(candidate.resource));
                this.handleChanges(relevantChanges);
            }),
            { dispose: () => this.clearInMemoryStorage() },
        );
        await this.cacheNewTasks(newStorage);
    }

    protected async handleChanges(changes: FileChange[]): Promise<void> {
        await Promise.all(changes.map(change => {
            switch (change.type) {
                case FileChangeType.DELETED: return this.deleteFileReference(change.resource);
                case FileChangeType.ADDED:
                case FileChangeType.UPDATED:
                    return this.readFile(change.resource);
                default: return unreachable(change.type);
            }
        }));
    }

    protected clearInMemoryStorage(): void {
        this.inMemoryStorage.clear();
    }

    protected deleteFileReference(uri: URI): boolean {
        if (this.inMemoryStorage.delete(uri.path.base)) {
            return true;
        }
        for (const summary of this.inMemoryStorage.getAll()) {
            if (summary.uri?.isEqual(uri)) {
                return this.inMemoryStorage.delete(summary.id);
            }
        }
        return false;
    }

    protected async cacheNewTasks(storageLocation: URI): Promise<void> {
        const contents = await this.fileService.resolve(storageLocation).catch(() => undefined);
        if (!contents?.children?.length) { return; }
        await Promise.all(contents.children.map(child => this.readFile(child.resource)));
        this.onDidChangeEmitter.fire();
    }

    protected async readFile(uri: URI): Promise<void> {
        const content = await this.fileService.read(uri).then(read => read.value).catch(() => undefined);
        if (content === undefined) { return; }
        const { frontmatter, body } = this.maybeReadFrontmatter(content);
        const rawLabel = frontmatter?.label || uri.path.base.slice(0, (-1 * uri.path.ext.length) || uri.path.base.length);
        const summary = {
            ...frontmatter,
            summary: body,
            label: this.sanitizeLabel(rawLabel),
            uri,
            id: frontmatter?.sessionId || uri.path.base
        };
        const existingSummary = summary.sessionId && this.getAll().find(candidate => candidate.sessionId === summary.sessionId);
        if (existingSummary) {
            summary.id = existingSummary.id;
        }
        this.inMemoryStorage.store(summary);
    }

    async store(summary: Summary): Promise<void> {
        const label = this.sanitizeLabel(summary.label);
        const storageLocation = await this.getStorageLocation();
        if (storageLocation) {
            const frontmatter = {
                sessionId: summary.sessionId,
                date: new Date().toISOString(),
                label,
            };
            const derivedName = label.trim().replace(/[^\p{L}\p{N}]/vg, '-').replace(/^-+|-+$/g, '');
            const filename = (derivedName.length > 32 ? derivedName.slice(0, derivedName.indexOf('-', 32)) : derivedName) + '.md';
            const content = yaml.dump(frontmatter).trim() + `${EOL}---${EOL}` + summary.summary;
            const uri = storageLocation.resolve(filename);
            summary.uri = uri;
            await this.fileService.writeFile(uri, BinaryBuffer.fromString(content));
        }
        this.inMemoryStorage.store({ ...summary, label });
        this.onDidChangeEmitter.fire();
    }

    getAll(): Summary[] {
        return this.inMemoryStorage.getAll();
    }

    get(identifier: string): Summary | undefined {
        return this.inMemoryStorage.get(identifier);
    }

    async delete(identifier: string): Promise<boolean> {
        const summary = this.inMemoryStorage.get(identifier);
        if (summary?.uri) {
            await this.fileService.delete(summary.uri);
        }
        this.inMemoryStorage.delete(identifier);
        if (summary) {
            this.onDidChangeEmitter.fire();
        }
        return !!summary;
    }

    protected maybeReadFrontmatter(content: string): { body: string, frontmatter: SummaryMetadata | undefined } {
        const frontmatterEnd = content.indexOf('---');
        if (frontmatterEnd !== -1) {
            try {
                const frontmatter = yaml.load(content.slice(0, frontmatterEnd));
                if (this.hasLabel(frontmatter)) {
                    return { frontmatter, body: content.slice(frontmatterEnd + 3).trim() };
                }
            } catch { /* Probably not frontmatter, then. */ }
        }
        return { body: content, frontmatter: undefined };
    }

    protected hasLabel(candidate: unknown): candidate is SummaryMetadata {
        return !!candidate && typeof candidate === 'object' && !Array.isArray(candidate) && 'label' in candidate && typeof candidate.label === 'string';
    }

    async open(identifier: string): Promise<void> {
        const summary = this.get(identifier);
        if (!summary) {
            throw new Error('Unable to open requested task context: none found with specified identifier.');
        }
        await (summary.uri ? open(this.openerService, summary.uri) : this.inMemoryStorage.open(identifier));
    }
}
