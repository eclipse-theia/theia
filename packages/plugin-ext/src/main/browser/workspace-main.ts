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
import { WorkspaceExt, StorageExt, MAIN_RPC_CONTEXT, WorkspaceMain, WorkspaceFolderPickOptionsMain } from '../../api/plugin-api';
import { RPCProtocol } from '../../api/rpc-protocol';
import Uri from 'vscode-uri';
import { UriComponents } from '../../common/uri-components';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { MonacoQuickOpenService } from '@theia/monaco/lib/browser/monaco-quick-open-service';
import { FileStat } from '@theia/filesystem/lib/common';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Resource } from '@theia/core/lib/common/resource';
import { Emitter, Event, Disposable, ResourceResolver } from '@theia/core';
import { FileWatcherSubscriberOptions } from '../../api/model';
import { InPluginFileSystemWatcherManager } from './in-plugin-filesystem-watcher-manager';
import { StoragePathService } from './storage-path-service';
import { PluginServer } from '../../common/plugin-protocol';

export class WorkspaceMainImpl implements WorkspaceMain {

    private proxy: WorkspaceExt;

    private storageProxy: StorageExt;

    private quickOpenService: MonacoQuickOpenService;

    private fileSearchService: FileSearchService;

    private inPluginFileSystemWatcherManager: InPluginFileSystemWatcherManager;

    private roots: FileStat[];

    private resourceResolver: TextContentResourceResolver;

    private pluginServer: PluginServer;

    private workspaceService: WorkspaceService;

    private storagePathService: StoragePathService;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.WORKSPACE_EXT);
        this.storageProxy = rpc.getProxy(MAIN_RPC_CONTEXT.STORAGE_EXT);
        this.quickOpenService = container.get(MonacoQuickOpenService);
        this.fileSearchService = container.get(FileSearchService);
        this.resourceResolver = container.get(TextContentResourceResolver);
        this.pluginServer = container.get(PluginServer);
        this.workspaceService = container.get(WorkspaceService);
        this.storagePathService = container.get(StoragePathService);

        this.inPluginFileSystemWatcherManager = new InPluginFileSystemWatcherManager(this.proxy, container);

        this.processWorkspaceFoldersChanged(this.workspaceService.tryGetRoots());
        this.workspaceService.onWorkspaceChanged(roots => {
            this.processWorkspaceFoldersChanged(roots);
        });
    }

    async processWorkspaceFoldersChanged(roots: FileStat[]): Promise<void> {
        if (this.isAnyRootChanged(roots) === false) {
            return;
        }
        this.roots = roots;
        this.proxy.$onWorkspaceFoldersChanged({ roots });

        await this.storagePathService.updateStoragePath(roots);

        const keyValueStorageWorkspacesData = await this.pluginServer.keyValueStorageGetAll(false);
        this.storageProxy.$updatePluginsWorkspaceData(keyValueStorageWorkspacesData);

    }

    private isAnyRootChanged(roots: FileStat[]): boolean {
        if (!this.roots || this.roots.length !== roots.length) {
            return true;
        }

        return this.roots.some((root, index) => root.uri !== roots[index].uri);
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

    async $startFileSearch(includePattern: string, includeFolderUri: string | undefined, excludePatternOrDisregardExcludes?: string | false,
        maxResults?: number): Promise<UriComponents[]> {
        const rootUris = includeFolderUri ? [includeFolderUri] : this.roots.map(r => r.uri);
        const opts: FileSearchService.Options = { rootUris };
        if (includePattern) {
            opts.includePatterns = [includePattern];
        }
        if (typeof excludePatternOrDisregardExcludes === 'string') {
            if (excludePatternOrDisregardExcludes === '') { // default excludes
                opts.defaultIgnorePatterns = [];
            } else {
                opts.defaultIgnorePatterns = [excludePatternOrDisregardExcludes];
            }
        }
        if (typeof maxResults === 'number') {
            opts.limit = maxResults;
        }
        const uriStrs = await this.fileSearchService.find('', opts);
        return uriStrs.map(uriStr => Uri.parse(uriStr));
    }

    $registerFileSystemWatcher(options: FileWatcherSubscriberOptions): Promise<string> {
        return Promise.resolve(this.inPluginFileSystemWatcherManager.registerFileWatchSubscription(options));
    }

    $unregisterFileSystemWatcher(watcherId: string): Promise<void> {
        this.inPluginFileSystemWatcherManager.unregisterFileWatchSubscription(watcherId);
        return Promise.resolve();
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

    async $updateWorkspaceFolders(start: number, deleteCount?: number, ...rootsToAdd: string[]): Promise<void> {
        await this.workspaceService.spliceRoots(start, deleteCount, ...rootsToAdd.map(root => new URI(root)));
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
