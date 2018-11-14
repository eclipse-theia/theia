/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as theia from '@theia/plugin';
import { interfaces, injectable } from 'inversify';
import { WorkspaceExt, MAIN_RPC_CONTEXT, WorkspaceMain, WorkspaceFolderPickOptionsMain } from '../../api/plugin-api';
import { RPCProtocol } from '../../api/rpc-protocol';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import Uri from 'vscode-uri';
import { UriComponents } from '../../common/uri-components';
import { Path } from '@theia/core/lib/common/path';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { MonacoQuickOpenService } from '@theia/monaco/lib/browser/monaco-quick-open-service';
import { FileStat } from '@theia/filesystem/lib/common';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import URI from '@theia/core/lib/common/uri';
import { Resource } from '@theia/core/lib/common/resource';
import { Emitter, Event, Disposable, ResourceResolver } from '@theia/core';

export class WorkspaceMainImpl implements WorkspaceMain {

    private proxy: WorkspaceExt;

    private quickOpenService: MonacoQuickOpenService;

    private fileSearchService: FileSearchService;

    private roots: FileStat[];

    private resourceResolver: TextContentResourceResolver;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.WORKSPACE_EXT);
        this.quickOpenService = container.get(MonacoQuickOpenService);
        const workspaceService = container.get(WorkspaceService);
        this.fileSearchService = container.get(FileSearchService);
        this.resourceResolver = container.get(TextContentResourceResolver);

        workspaceService.roots.then(roots => {
            this.roots = roots;
            this.notifyWorkspaceFoldersChanged();
        });
    }

    notifyWorkspaceFoldersChanged() {
        if (this.roots && this.roots.length) {
            const folders = this.roots.map(root => {
                const uri = Uri.parse(root.uri);
                const path = new Path(uri.path);
                return {
                    uri: uri,
                    name: path.base,
                    index: 0
                } as theia.WorkspaceFolder;
            });

            this.proxy.$onWorkspaceFoldersChanged({
                added: folders,
                removed: []
            } as theia.WorkspaceFoldersChangeEvent);
        } else {
            this.proxy.$onWorkspaceFoldersChanged({
                added: [],
                removed: []
            } as theia.WorkspaceFoldersChangeEvent);
        }
    }

    $pickWorkspaceFolder(options: WorkspaceFolderPickOptionsMain): Promise<theia.WorkspaceFolder | undefined> {
        return new Promise((resolve, reject) => {
            // Return undefined if workspace root is not set
            if (!this.roots || !this.roots.length) {
                resolve(undefined);
                return;
            }

            // Active before appearing the pick menu
            const activeElement: HTMLElement | undefined = window.document.activeElement as HTMLElement;

            // WorkspaceFolder to be returned
            let returnValue: theia.WorkspaceFolder | undefined;

            const items = this.roots.map(root => {
                const rootUri = Uri.parse(root.uri);
                const rootPathName = rootUri.path.substring(rootUri.path.lastIndexOf('/') + 1);
                return new QuickOpenItem({
                    label: rootPathName,
                    detail: rootUri.path,
                    run: mode => {
                        if (mode === QuickOpenMode.OPEN) {
                            returnValue = {
                                uri: rootUri,
                                name: rootPathName,
                                index: 0
                            } as theia.WorkspaceFolder;
                        }
                        return true;
                    }
                });
            });

            // Create quick open model
            const model = {
                onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                    acceptor(items);
                }
            } as QuickOpenModel;

            // Show pick menu
            this.quickOpenService.open(model, {
                fuzzyMatchLabel: true,
                fuzzyMatchDetail: true,
                fuzzyMatchDescription: true,
                placeholder: options.placeHolder,
                onClose: () => {
                    if (activeElement) {
                        activeElement.focus();
                    }

                    resolve(returnValue);
                }
            });
        });
    }

    $startFileSearch(includePattern: string, excludePatternOrDisregardExcludes?: string | false,
        maxResults?: number, token?: theia.CancellationToken): Promise<UriComponents[]> {
        const uris: UriComponents[] = new Array();
        let j = 0;
        // tslint:disable-next-line:no-any
        const promises: Promise<any>[] = new Array();
        for (const root of this.roots) {
            promises[j++] = this.fileSearchService.find(includePattern, { rootUri: root.uri }).then(value => {
                const paths: string[] = new Array();
                let i = 0;
                value.forEach(item => {
                    let path: string;
                    path = root.uri.endsWith('/') ? root.uri + item : root.uri + '/' + item;
                    paths[i++] = path;
                });
                return Promise.resolve(paths);
            });
        }
        return Promise.all(promises).then(value => {
            let i = 0;
            value.forEach(path => {
                uris[i++] = Uri.parse(path);
            });
            return Promise.resolve(uris);
        });
    }

    async $registerTextDocumentContentProvider(scheme: string): Promise<void> {
        return this.resourceResolver.registerContentProvider(scheme, this.proxy);
    }

    $unregisterTextDocumentContentProvider(scheme: string): void {
        this.resourceResolver.unregisterContentProvider(scheme);
    }

    $onTextDocumentContentChange(uri: string, content: string): void {
        this.resourceResolver.onContentChange(uri, content);
    }

}

/**
 * Text content provider for resources with custom scheme.
 */
export interface TextContentResourceProvider {

    /**
     * Provides resource for given URI
     */
    provideResource(uri: URI): Resource;

}

@injectable()
export class TextContentResourceResolver implements ResourceResolver {

    // Resource providers for different schemes
    private providers = new Map<string, TextContentResourceProvider>();

    // Opened resources
    private resources = new Map<string, TextContentResource>();

    async resolve(uri: URI): Promise<Resource> {
        const provider = this.providers.get(uri.scheme);
        if (provider) {
            return provider.provideResource(uri);
        }

        throw new Error(`Unable to find Text Content Resource Provider for scheme '${uri.scheme}'`);
    }

    async registerContentProvider(scheme: string, proxy: WorkspaceExt): Promise<void> {
        if (this.providers.has(scheme)) {
            throw new Error(`Text Content Resource Provider for scheme '${scheme}' is already registered`);
        }

        const instance = this;
        this.providers.set(scheme, {
            provideResource: (uri: URI): Resource => {
                let resource = instance.resources.get(uri.toString());
                if (resource) {
                    return resource;
                }

                resource = new TextContentResource(uri, proxy, {
                    dispose() {
                        instance.resources.delete(uri.toString());
                    }
                });

                instance.resources.set(uri.toString(), resource);
                return resource;
            }
        });
    }

    unregisterContentProvider(scheme: string): void {
        if (!this.providers.delete(scheme)) {
            throw new Error(`Text Content Resource Provider for scheme '${scheme}' has not been registered`);
        }
    }

    onContentChange(uri: string, content: string): void {
        const resource = this.resources.get(uri);
        if (resource) {
            resource.setContent(content);
        }
    }

}

export class TextContentResource implements Resource {

    private onDidChangeContentsEmmiter: Emitter<void> = new Emitter<void>();
    readonly onDidChangeContents: Event<void> = this.onDidChangeContentsEmmiter.event;

    // cached content
    cache: string | undefined;

    constructor(public uri: URI, private proxy: WorkspaceExt, protected disposable: Disposable) {
    }

    async readContents(options?: { encoding?: string }): Promise<string> {
        if (this.cache) {
            const content = this.cache;
            this.cache = undefined;
            return content;
        } else {
            const content = await this.proxy.$provideTextDocumentContent(this.uri.toString());
            if (content) {
                return content;
            }
        }

        return Promise.reject(`Unable to get content for '${this.uri.toString()}'`);
    }

    dispose() {
        this.disposable.dispose();
    }

    setContent(content: string) {
        this.cache = content;
        this.onDidChangeContentsEmmiter.fire(undefined);
    }

}
