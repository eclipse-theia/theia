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

    protected readonly resolvedUris = new Map<string, URI>();
    protected readonly resolvingPaths = new Set<string>();
    protected readonly failedResolutionPaths = new Set<string>();

    protected readonly onDidChangeEmitter = new Emitter<DidChangeLabelEvent>();
    readonly onDidChange: Event<DidChangeLabelEvent> = this.onDidChangeEmitter.event;

    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    init(): void {
        if (this.fileService?.onDidFilesChange) {
            this.toDispose.push(this.fileService.onDidFilesChange(() => {
                this.invalidateAndReResolve();
            }));
        }
        if (this.workspaceService?.onWorkspaceChanged) {
            this.toDispose.push(this.workspaceService.onWorkspaceChanged(() => {
                this.invalidateAndReResolve();
            }));
        }
        if (this.workspaceService?.onWorkspaceLocationChanged) {
            this.toDispose.push(this.workspaceService.onWorkspaceLocationChanged(() => {
                this.invalidateAndReResolve();
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
        const uri = this.getUri(element);
        return uri ? event.affects(uri) : false;
    }

    getIcon(element: object): string | undefined {
        const uri = this.getUri(element);
        if (uri) {
            return this.labelProvider.getIcon(uri);
        }
        const rawArg = this.getRawArg(element);
        if (!rawArg) {
            return undefined;
        }
        const normalized = Path.normalizePathSeparator(rawArg);
        const path = new Path(normalized).normalize();
        const syntheticUri = URI.fromFilePath('/' + path.toString());
        return this.labelProvider.getIcon(syntheticUri);
    }

    getName(element: object): string | undefined {
        const uri = this.getUri(element);
        if (uri) {
            return this.labelProvider.getName(uri);
        }
        const rawArg = this.getRawArg(element);
        if (!rawArg) {
            return undefined;
        }
        const normalized = Path.normalizePathSeparator(rawArg);
        const path = new Path(normalized).normalize();
        return path.base || rawArg;
    }

    getLongName(element: object): string | undefined {
        const uri = this.getUri(element);
        if (uri) {
            return this.labelProvider.getLongName(uri);
        }
        const rawArg = this.getRawArg(element);
        if (!rawArg) {
            return undefined;
        }
        const normalized = Path.normalizePathSeparator(rawArg);
        const path = new Path(normalized).normalize();
        return path.toString();
    }

    getDetails(element: object): string | undefined {
        const uri = this.getUri(element);
        if (uri) {
            return this.labelProvider.getDetails(uri);
        }
        const rawArg = this.getRawArg(element);
        if (!rawArg) {
            return undefined;
        }
        const normalized = Path.normalizePathSeparator(rawArg);
        const path = new Path(normalized).normalize();
        const segments = path.toString().split('/').filter(s => s.length > 0);
        segments.pop();
        return segments.join('/');
    }

    async resolveUri(element: object): Promise<URI | undefined> {
        const rawArg = this.getRawArg(element);
        if (!rawArg) {
            return undefined;
        }

        const directUri = this.parseDirectUri(rawArg);
        if (directUri) {
            return directUri;
        }

        if (this.resolvedUris.has(rawArg)) {
            return this.resolvedUris.get(rawArg);
        }

        if (this.pathResolver) {
            const resolved = await this.pathResolver.resolveExistingRelativePath(rawArg);
            if (resolved) {
                this.resolvedUris.set(rawArg, resolved);
                return resolved;
            }
        }

        return undefined;
    }

    async invalidateAndReResolve(): Promise<void> {
        const paths = Array.from(new Set([...this.resolvedUris.keys(), ...this.failedResolutionPaths]));
        if (paths.length === 0) {
            return;
        }

        this.failedResolutionPaths.clear();

        if (!this.pathResolver) {
            this.resolvedUris.clear();
            this.fireDidChange();
            return;
        }

        await Promise.all(paths.map(async rawArg => {
            this.resolvingPaths.add(rawArg);
            try {
                const oldUri = this.resolvedUris.get(rawArg);
                const newUri = await this.pathResolver!.resolveExistingRelativePath(rawArg);
                if (newUri) {
                    this.resolvedUris.set(rawArg, newUri);
                    if (!oldUri || !oldUri.isEqual(newUri)) {
                        this.fireDidChange(rawArg);
                    }
                } else {
                    const wasResolved = this.resolvedUris.has(rawArg);
                    this.resolvedUris.delete(rawArg);
                    this.failedResolutionPaths.add(rawArg);
                    if (wasResolved) {
                        this.fireDidChange(rawArg);
                    }
                }
            } catch {
                const wasResolved = this.resolvedUris.has(rawArg);
                this.resolvedUris.delete(rawArg);
                this.failedResolutionPaths.add(rawArg);
                if (wasResolved) {
                    this.fireDidChange(rawArg);
                }
            } finally {
                this.resolvingPaths.delete(rawArg);
            }
        }));
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

        if (this.resolvedUris.has(rawArg)) {
            return this.resolvedUris.get(rawArg);
        }

        this.resolveExistingRelativePath(rawArg);
        return undefined;
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

    protected resolveExistingRelativePath(rawArg: string): void {
        if (!this.pathResolver || this.resolvingPaths.has(rawArg) || this.failedResolutionPaths.has(rawArg)) {
            return;
        }
        this.resolvingPaths.add(rawArg);
        this.pathResolver.resolveExistingRelativePath(rawArg).then(resolved => {
            this.resolvingPaths.delete(rawArg);
            if (resolved) {
                const current = this.resolvedUris.get(rawArg);
                if (!current || !current.isEqual(resolved)) {
                    this.resolvedUris.set(rawArg, resolved);
                    this.fireDidChange(rawArg);
                }
            } else {
                this.failedResolutionPaths.add(rawArg);
            }
        }).catch(() => {
            this.resolvingPaths.delete(rawArg);
            this.failedResolutionPaths.add(rawArg);
        });
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
