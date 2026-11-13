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

import { AIVariableResolutionRequest } from '@theia/ai-core';
import { WorkspaceRelativePathResolver } from '@theia/ai-core/lib/browser';
import { Disposable, DisposableCollection, Emitter, Event, Path, URI } from '@theia/core';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { DidChangeLabelEvent, LabelProvider, LabelProviderContribution } from '@theia/core/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { ChangeSetFileService } from './change-set-file-service.js';

interface CacheEntry {
    readonly generation: number;
    status: 'pending' | 'resolved' | 'missing';
    uri?: URI;
}

@injectable()
export class ContextFileVariableLabelProvider implements LabelProviderContribution, Disposable {

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(WorkspaceService) @optional()
    protected readonly workspaceService?: WorkspaceService;

    @inject(ChangeSetFileService)
    protected readonly changeSetFileService: ChangeSetFileService;

    @inject(WorkspaceRelativePathResolver) @optional()
    protected readonly pathResolver?: WorkspaceRelativePathResolver;

    @inject(FileService) @optional()
    protected readonly fileService?: FileService;

    protected readonly cache = new Map<string, CacheEntry>();
    protected currentGeneration = 0;

    protected readonly onDidChangeEmitter = new Emitter<DidChangeLabelEvent>();
    readonly onDidChange: Event<DidChangeLabelEvent> = this.onDidChangeEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    init(): void {
        if (this.fileService?.onDidFilesChange) {
            this.toDispose.push(this.fileService.onDidFilesChange(() => {
                this.handleFilesOrWorkspaceChanged();
            }));
        }
        if (this.workspaceService?.onWorkspaceChanged) {
            this.toDispose.push(this.workspaceService.onWorkspaceChanged(() => {
                this.handleFilesOrWorkspaceChanged();
            }));
        }
        if (this.workspaceService?.onWorkspaceLocationChanged) {
            this.toDispose.push(this.workspaceService.onWorkspaceLocationChanged(() => {
                this.handleFilesOrWorkspaceChanged();
            }));
        }
    }

    dispose(): void {
        this.toDispose.dispose();
        this.onDidChangeEmitter.dispose();
    }

    canHandle(element: object): number {
        if (AIVariableResolutionRequest.is(element) && element.variable.name === 'file') {
            return 10;
        }
        return -1;
    }

    affects(element: object, event: DidChangeLabelEvent): boolean {
        if (!AIVariableResolutionRequest.is(element) || element.variable.name !== 'file') {
            return false;
        }
        if (event.affects(element)) {
            return true;
        }
        const rawArg = this.getRawArg(element);
        if (!rawArg) {
            return false;
        }
        const directUri = this.parseDirectUri(rawArg);
        if (directUri) {
            return event.affects(directUri);
        }
        const entry = this.cache.get(rawArg);
        if (entry?.status === 'resolved' && entry.generation === this.currentGeneration && entry.uri) {
            return event.affects(entry.uri);
        }
        return false;
    }

    getIcon(element: object): string | undefined {
        const uri = this.getUri(element);
        if (uri) {
            return this.labelProvider.getIcon(uri);
        }
        const path = this.getFallbackPath(element);
        if (!path) {
            return undefined;
        }
        const syntheticUri = URI.fromFilePath('/' + path.toString());
        return this.labelProvider.getIcon(syntheticUri);
    }

    getName(element: object): string | undefined {
        const uri = this.getUri(element);
        if (uri) {
            return this.labelProvider.getName(uri);
        }
        const path = this.getFallbackPath(element);
        return path ? (path.base || path.toString()) : undefined;
    }

    getLongName(element: object): string | undefined {
        const uri = this.getUri(element);
        if (uri) {
            return this.labelProvider.getLongName(uri);
        }
        return this.getFallbackPath(element)?.toString();
    }

    getDetails(element: object): string | undefined {
        const uri = this.getUri(element);
        if (uri) {
            return this.labelProvider.getDetails(uri);
        }
        const path = this.getFallbackPath(element);
        if (!path) {
            return undefined;
        }
        return path.hasDir ? path.dir.toString() : '';
    }

    protected handleFilesOrWorkspaceChanged(): void {
        this.currentGeneration++;
        this.cache.clear();
        this.fireDidChange();
    }

    protected getUri(element: object): URI | undefined {
        const rawArg = this.getRawArg(element);
        if (!rawArg) {
            return undefined;
        }

        const directUri = this.parseDirectUri(rawArg);
        if (directUri) {
            return directUri;
        }

        const entry = this.cache.get(rawArg);
        if (!entry || entry.generation !== this.currentGeneration) {
            const newEntry: CacheEntry = {
                generation: this.currentGeneration,
                status: 'pending'
            };
            this.cache.set(rawArg, newEntry);
            this.lookup(rawArg, newEntry);
            return undefined;
        }

        if (entry.status === 'resolved') {
            return entry.uri;
        }

        return undefined;
    }

    protected lookup(rawArg: string, entry: CacheEntry): void {
        if (!this.pathResolver) {
            if (this.cache.get(rawArg) === entry && entry.generation === this.currentGeneration) {
                entry.status = 'missing';
            }
            return;
        }

        this.pathResolver.resolveExistingRelativePath(rawArg).then(resolved => {
            if (this.cache.get(rawArg) !== entry || entry.generation !== this.currentGeneration) {
                return;
            }
            if (resolved) {
                entry.status = 'resolved';
                entry.uri = resolved;
            } else {
                entry.status = 'missing';
                entry.uri = undefined;
            }
            this.fireDidChange(rawArg);
        }).catch(() => {
            if (this.cache.get(rawArg) === entry && entry.generation === this.currentGeneration) {
                entry.status = 'missing';
                entry.uri = undefined;
                this.fireDidChange(rawArg);
            }
        });
    }

    protected getFallbackPath(element: object): Path | undefined {
        const rawArg = this.getRawArg(element);
        if (!rawArg) {
            return undefined;
        }
        return new Path(Path.normalizePathSeparator(rawArg)).normalize();
    }

    protected parseDirectUri(rawArg: string): URI | undefined {
        if (this.isUriScheme(rawArg)) {
            return new URI(rawArg);
        }

        const normalized = Path.normalizePathSeparator(rawArg);
        const path = new Path(normalized).normalize();
        const segments = path.toString().split('/').filter(segment => segment.length > 0);
        if (path.isAbsolute || Path.isDrive(segments[0] ?? '')) {
            return URI.fromFilePath(normalized);
        }

        return undefined;
    }

    protected fireDidChange(rawArg?: string): void {
        this.onDidChangeEmitter.fire({
            affects: el => {
                if (!AIVariableResolutionRequest.is(el) || el.variable.name !== 'file') {
                    return false;
                }
                return !rawArg || el.arg?.trim() === rawArg;
            }
        });
    }

    protected getRawArg(element: object): string | undefined {
        if (!AIVariableResolutionRequest.is(element) || !element.arg) {
            return undefined;
        }
        const rawArg = element.arg.trim();
        return rawArg.length > 0 ? rawArg : undefined;
    }

    protected isUriScheme(arg: string): boolean {
        // Matches anchored URI schemes (e.g., file:/..., user-storage:/...) while excluding Windows drive letters
        return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(arg) && !/^[a-zA-Z]:/.test(arg);
    }

}
