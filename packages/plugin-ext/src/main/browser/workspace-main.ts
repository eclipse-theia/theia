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
import { WorkspaceExt, StorageExt, MAIN_RPC_CONTEXT, WorkspaceMain, WorkspaceFolderPickOptionsMain } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { URI as Uri } from 'vscode-uri';
import { UriComponents, theiaUritoUriComponents } from '../../common/uri-components';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { MonacoQuickOpenService } from '@theia/monaco/lib/browser/monaco-quick-open-service';
import { FileStat } from '@theia/filesystem/lib/common';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import URI from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { Resource } from '@theia/core/lib/common/resource';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Emitter, Event, ResourceResolver, CancellationToken } from '@theia/core';
import { FileWatcherSubscriberOptions } from '../../common/plugin-api-rpc-model';
import { InPluginFileSystemWatcherManager } from './in-plugin-filesystem-watcher-manager';
import { PluginServer } from '../../common/plugin-protocol';
import { FileSystemPreferences, FileSystemWatcher } from '@theia/filesystem/lib/browser';
import { SearchInWorkspaceService } from '@theia/search-in-workspace/lib/browser/search-in-workspace-service';

export class WorkspaceMainImpl implements WorkspaceMain, Disposable {

    private readonly proxy: WorkspaceExt;

    private storageProxy: StorageExt;

    private quickOpenService: MonacoQuickOpenService;

    private fileSearchService: FileSearchService;

    private searchInWorkspaceService: SearchInWorkspaceService;

    private inPluginFileSystemWatcherManager: InPluginFileSystemWatcherManager;

    private roots: FileStat[];

    private resourceResolver: TextContentResourceResolver;

    private pluginServer: PluginServer;

    private workspaceService: WorkspaceService;

    private fsPreferences: FileSystemPreferences;

    private fileSystemWatcher: FileSystemWatcher;

    protected readonly toDispose = new DisposableCollection();

    protected workspaceSearch: Set<number> = new Set<number>();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.WORKSPACE_EXT);
        this.storageProxy = rpc.getProxy(MAIN_RPC_CONTEXT.STORAGE_EXT);
        this.quickOpenService = container.get(MonacoQuickOpenService);
        this.fileSearchService = container.get(FileSearchService);
        this.searchInWorkspaceService = container.get(SearchInWorkspaceService);
        this.resourceResolver = container.get(TextContentResourceResolver);
        this.pluginServer = container.get(PluginServer);
        this.workspaceService = container.get(WorkspaceService);
        this.fsPreferences = container.get(FileSystemPreferences);
        this.fileSystemWatcher = container.get(FileSystemWatcher);
        this.inPluginFileSystemWatcherManager = container.get(InPluginFileSystemWatcherManager);

        this.processWorkspaceFoldersChanged(this.workspaceService.tryGetRoots());
        this.toDispose.push(this.workspaceService.onWorkspaceChanged(roots => {
            this.processWorkspaceFoldersChanged(roots);
        }));

        this.toDispose.push(this.fileSystemWatcher.onWillCreate(event => {
            event.waitUntil(this.proxy.$onWillCreateFiles({ files: [theiaUritoUriComponents(event.uri)] }));
        }));
        this.toDispose.push(this.fileSystemWatcher.onDidCreate(event => {
            this.proxy.$onDidCreateFiles({ files: [theiaUritoUriComponents(event.uri)] });
        }));
        this.toDispose.push(this.fileSystemWatcher.onWillMove(event => {
            event.waitUntil(this.proxy.$onWillRenameFiles({
                files: [{
                    oldUri: theiaUritoUriComponents(event.sourceUri),
                    newUri: theiaUritoUriComponents(event.targetUri),
                }],
            }));
        }));
        this.toDispose.push(this.fileSystemWatcher.onDidMove(event => {
            this.proxy.$onDidRenameFiles({
                files: [{
                    oldUri: theiaUritoUriComponents(event.sourceUri),
                    newUri: theiaUritoUriComponents(event.targetUri),
                }],
            });
        }));
        this.toDispose.push(this.fileSystemWatcher.onWillDelete(event => {
            event.waitUntil(this.proxy.$onWillDeleteFiles({ files: [theiaUritoUriComponents(event.uri)] }));
        }));
        this.toDispose.push(this.fileSystemWatcher.onDidDelete(event => {
            this.proxy.$onDidDeleteFiles({ files: [theiaUritoUriComponents(event.uri)] });
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected async processWorkspaceFoldersChanged(roots: FileStat[]): Promise<void> {
        if (this.isAnyRootChanged(roots) === false) {
            return;
        }
        this.roots = roots;
        this.proxy.$onWorkspaceFoldersChanged({ roots });

        const keyValueStorageWorkspacesData = await this.pluginServer.getAllStorageValues({
            workspace: this.workspaceService.workspace,
            roots: this.workspaceService.tryGetRoots()
        });
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
                        activeElement.focus({ preventScroll: true });
                    }

                    resolve(returnValue);
                }
            });
        });
    }

    async $startFileSearch(includePattern: string, includeFolderUri: string | undefined, excludePatternOrDisregardExcludes?: string | false,
        maxResults?: number): Promise<UriComponents[]> {
        const roots: FileSearchService.RootOptions = {};
        const rootUris = includeFolderUri ? [includeFolderUri] : this.roots.map(r => r.uri);
        for (const rootUri of rootUris) {
            roots[rootUri] = {};
        }
        const opts: FileSearchService.Options = { rootOptions: roots };
        if (includePattern) {
            opts.includePatterns = [includePattern];
        }
        if (typeof excludePatternOrDisregardExcludes === 'string') {
            opts.excludePatterns = [excludePatternOrDisregardExcludes];
        }
        if (excludePatternOrDisregardExcludes !== false) {
            for (const rootUri of rootUris) {
                const filesExclude = this.fsPreferences.get('files.exclude', undefined, rootUri);
                if (filesExclude) {
                    for (const excludePattern in filesExclude) {
                        if (filesExclude[excludePattern]) {
                            const rootOptions = roots[rootUri];
                            const rootExcludePatterns = rootOptions.excludePatterns || [];
                            rootExcludePatterns.push(excludePattern);
                            rootOptions.excludePatterns = rootExcludePatterns;
                        }
                    }
                }
            }
        }
        if (typeof maxResults === 'number') {
            opts.limit = maxResults;
        }
        const uriStrs = await this.fileSearchService.find('', opts);
        return uriStrs.map(uriStr => Uri.parse(uriStr));
    }

    async $findTextInFiles(query: theia.TextSearchQuery, options: theia.FindTextInFilesOptions, searchRequestId: number,
        token: theia.CancellationToken = CancellationToken.None): Promise<theia.TextSearchComplete> {
        const maxHits = options.maxResults ? options.maxResults : 150;
        const excludes = options.exclude ? (typeof options.exclude === 'string' ? options.exclude : (<theia.RelativePattern>options.exclude).pattern) : undefined;
        const includes = options.include ? (typeof options.include === 'string' ? options.include : (<theia.RelativePattern>options.include).pattern) : undefined;
        let canceledRequest = false;
        return new Promise(resolve => {
            let matches = 0;
            const what: string = query.pattern;
            const rootUris = this.roots.map(r => r.uri);
            this.searchInWorkspaceService.searchWithCallback(what, rootUris, {
                onResult: (searchId, result) => {
                    if (canceledRequest) {
                        return;
                    }
                    const hasSearch = this.workspaceSearch.has(searchId);
                    if (!hasSearch) {
                        this.workspaceSearch.add(searchId);
                        token.onCancellationRequested(() => {
                            this.searchInWorkspaceService.cancel(searchId);
                            canceledRequest = true;
                        });
                    }
                    if (token.isCancellationRequested) {
                        this.searchInWorkspaceService.cancel(searchId);
                        canceledRequest = true;
                        return;
                    }
                    if (result && result.matches && result.matches.length) {
                        while ((matches + result.matches.length) > maxHits) {
                            result.matches.splice(result.matches.length - 1, 1);
                        }
                        this.proxy.$onTextSearchResult(searchRequestId, false, result);
                        matches += result.matches.length;
                        if (maxHits <= matches) {
                            this.searchInWorkspaceService.cancel(searchId);
                        }
                    }
                },
                onDone: (searchId, _error) => {
                    const hasSearch = this.workspaceSearch.has(searchId);
                    if (hasSearch) {
                        this.searchInWorkspaceService.cancel(searchId);
                        this.workspaceSearch.delete(searchId);
                    }
                    this.proxy.$onTextSearchResult(searchRequestId, true);
                    if (maxHits <= matches) {
                        resolve({ limitHit: true });
                    } else {
                        resolve({ limitHit: false });
                    }
                }
            }, {
                useRegExp: query.isRegExp,
                matchCase: query.isCaseSensitive,
                matchWholeWord: query.isWordMatch,
                exclude: excludes ? [excludes] : undefined,
                include: includes ? [includes] : undefined,
                maxResults: maxHits
            });
        });
    }

    async $registerFileSystemWatcher(options: FileWatcherSubscriberOptions): Promise<string> {
        const handle = this.inPluginFileSystemWatcherManager.registerFileWatchSubscription(options, this.proxy);
        this.toDispose.push(Disposable.create(() => this.inPluginFileSystemWatcherManager.unregisterFileWatchSubscription(handle)));
        return handle;
    }

    $unregisterFileSystemWatcher(watcherId: string): Promise<void> {
        this.inPluginFileSystemWatcherManager.unregisterFileWatchSubscription(watcherId);
        return Promise.resolve();
    }

    async $registerTextDocumentContentProvider(scheme: string): Promise<void> {
        this.resourceResolver.registerContentProvider(scheme, this.proxy);
        this.toDispose.push(Disposable.create(() => this.resourceResolver.unregisterContentProvider(scheme)));
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

    registerContentProvider(scheme: string, proxy: WorkspaceExt): void {
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
                    dispose(): void {
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

    private onDidChangeContentsEmitter: Emitter<void> = new Emitter<void>();
    readonly onDidChangeContents: Event<void> = this.onDidChangeContentsEmitter.event;

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

        return Promise.reject(new Error(`Unable to get content for '${this.uri.toString()}'`));
    }

    dispose(): void {
        this.disposable.dispose();
    }

    setContent(content: string): void {
        this.cache = content;
        this.onDidChangeContentsEmitter.fire(undefined);
    }

}
