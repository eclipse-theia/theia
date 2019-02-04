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

import * as paths from 'path';
import * as theia from '@theia/plugin';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import {
    WorkspaceExt,
    WorkspaceFolderPickOptionsMain,
    WorkspaceMain,
    PLUGIN_RPC_CONTEXT as Ext
} from '../api/plugin-api';
import { Path } from '@theia/core/lib/common/path';
import { RPCProtocol } from '../api/rpc-protocol';
import { WorkspaceRootsChangeEvent, FileChangeEvent } from '../api/model';
import { EditorsAndDocumentsExtImpl } from './editors-and-documents';
import { InPluginFileSystemWatcherProxy } from './in-plugin-filesystem-watcher-proxy';
import URI from 'vscode-uri';
import { FileStat } from '@theia/filesystem/lib/common';
import { normalize } from '../common/paths';
import { relative } from '../common/paths-util';

export class WorkspaceExtImpl implements WorkspaceExt {

    private proxy: WorkspaceMain;
    private fileSystemWatcherManager: InPluginFileSystemWatcherProxy;

    private workspaceFoldersChangedEmitter = new Emitter<theia.WorkspaceFoldersChangeEvent>();
    public readonly onDidChangeWorkspaceFolders: Event<theia.WorkspaceFoldersChangeEvent> = this.workspaceFoldersChangedEmitter.event;

    private folders: theia.WorkspaceFolder[] | undefined;
    private documentContentProviders = new Map<string, theia.TextDocumentContentProvider>();

    constructor(rpc: RPCProtocol, private editorsAndDocuments: EditorsAndDocumentsExtImpl) {
        this.proxy = rpc.getProxy(Ext.WORKSPACE_MAIN);
        this.fileSystemWatcherManager = new InPluginFileSystemWatcherProxy(this.proxy);
    }

    get rootPath(): string | undefined {
        const folder = this.folders && this.folders[0];
        return folder && folder.uri.fsPath;
    }

    get workspaceFolders(): theia.WorkspaceFolder[] | undefined {
        return this.folders;
    }

    get name(): string | undefined {
        if (this.workspaceFolders) {
            return new Path(this.workspaceFolders[0].uri.path).base;
        }

        return undefined;
    }

    $onWorkspaceFoldersChanged(event: WorkspaceRootsChangeEvent): void {
        const newRoots = event.roots || [];
        const newFolders = newRoots.map((root, index) => this.toWorkspaceFolder(root, index));
        const added = this.foldersDiff(newFolders, this.folders);
        const removed = this.foldersDiff(this.folders, newFolders);

        this.folders = newFolders;

        this.workspaceFoldersChangedEmitter.fire({
            added: added,
            removed: removed
        });
    }

    private foldersDiff(folder1: theia.WorkspaceFolder[] = [], folder2: theia.WorkspaceFolder[] = []): theia.WorkspaceFolder[] {
        const map = new Map();
        folder1.forEach(folder => map.set(folder.uri.toString(), folder));
        folder2.forEach(folder => map.delete(folder.uri.toString()));

        return folder1.filter(folder => map.has(folder.uri.toString()));
    }

    private toWorkspaceFolder(root: FileStat, index: number): theia.WorkspaceFolder {
        const uri = URI.parse(root.uri);
        const path = new Path(uri.path);
        return {
            uri: uri,
            name: path.base,
            index: index
        };
    }

    pickWorkspaceFolder(options?: theia.WorkspaceFolderPickOptions): PromiseLike<theia.WorkspaceFolder | undefined> {
        return new Promise((resolve, reject) => {
            const optionsMain: WorkspaceFolderPickOptionsMain = {
                placeHolder: options && options.placeHolder ? options.placeHolder : undefined,
                ignoreFocusOut: options && options.ignoreFocusOut
            };

            this.proxy.$pickWorkspaceFolder(optionsMain).then(value => {
                resolve(value);
            });
        });
    }

    findFiles(include: theia.GlobPattern, exclude?: theia.GlobPattern | undefined, maxResults?: number,
        token: CancellationToken = CancellationToken.None): PromiseLike<URI[]> {
        let includePattern: string;
        if (include) {
            if (typeof include === 'string') {
                includePattern = include;
            } else {
                includePattern = include.pattern;
            }
        } else {
            includePattern = '';
        }

        let excludePatternOrDisregardExcludes: string | false;
        if (exclude === undefined) {
            excludePatternOrDisregardExcludes = false;
        } else if (exclude) {
            if (typeof exclude === 'string') {
                excludePatternOrDisregardExcludes = exclude;
            } else {
                excludePatternOrDisregardExcludes = exclude.pattern;
            }
        } else {
            excludePatternOrDisregardExcludes = false;
        }

        if (token && token.isCancellationRequested) {
            return Promise.resolve([]);
        }

        return this.proxy.$startFileSearch(includePattern, excludePatternOrDisregardExcludes, maxResults, token)
            .then(data => Array.isArray(data) ? data.map(URI.revive) : []);
    }

    createFileSystemWatcher(globPattern: theia.GlobPattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): theia.FileSystemWatcher {
        return this.fileSystemWatcherManager.createFileSystemWatcher(globPattern, ignoreCreateEvents, ignoreChangeEvents, ignoreDeleteEvents);
    }

    $fileChanged(event: FileChangeEvent): void {
        this.fileSystemWatcherManager.onFileSystemEvent(event.subscriberId, URI.revive(event.uri), event.type);
    }

    registerTextDocumentContentProvider(scheme: string, provider: theia.TextDocumentContentProvider): theia.Disposable {
        if (scheme === 'file' || scheme === 'untitled' || this.documentContentProviders.has(scheme)) {
            throw new Error(`Text Content Document Provider for scheme '${scheme}' is already registered`);
        }

        this.documentContentProviders.set(scheme, provider);
        this.proxy.$registerTextDocumentContentProvider(scheme);

        let onDidChangeSubscription: theia.Disposable;
        if (typeof provider.onDidChange === 'function') {
            onDidChangeSubscription = provider.onDidChange(async uri => {
                if (uri.scheme === scheme && this.editorsAndDocuments.getDocument(uri.toString())) {
                    const content = await this.$provideTextDocumentContent(uri.toString());
                    if (content) {
                        this.proxy.$onTextDocumentContentChange(uri.toString(), content);
                    }
                }
            });
        }

        const instance = this;
        return {
            dispose() {
                if (instance.documentContentProviders.delete(scheme)) {
                    instance.proxy.$unregisterTextDocumentContentProvider(scheme);
                }

                if (onDidChangeSubscription) {
                    onDidChangeSubscription.dispose();
                }
            }
        };
    }

    async $provideTextDocumentContent(documentURI: string): Promise<string | undefined> {
        const uri = URI.parse(documentURI);
        const provider = this.documentContentProviders.get(uri.scheme);
        if (provider) {
            return provider.provideTextDocumentContent(uri, CancellationToken.None);
        }

        return undefined;
    }

    getWorkspaceFolder(uri: theia.Uri, resolveParent?: boolean): theia.WorkspaceFolder | URI | undefined {
        if (!this.folders || !this.folders.length) {
            return undefined;
        }

        function dirname(resource: URI): URI {
            if (resource.scheme === 'file') {
                return URI.file(paths.dirname(resource.fsPath));
            }
            return resource.with({
                path: paths.dirname(resource.path)
            });
        }

        if (resolveParent && this.hasFolder(uri)) {
            uri = dirname(uri);
        }

        const resourcePath = uri.toString();

        let workspaceFolder: theia.WorkspaceFolder | undefined;
        for (let i = 0; i < this.folders.length; i++) {
            const folder = this.folders[i];
            const folderPath = folder.uri.toString();

            if (resourcePath === folderPath) {
                // return the input when the given uri is a workspace folder itself
                return uri;
            }

            if (resourcePath.startsWith(folderPath)
                && resourcePath[folderPath.length] === '/'
                && (!workspaceFolder || folderPath.length > workspaceFolder.uri.toString().length)) {
                workspaceFolder = folder;
            }
        }
        return workspaceFolder;
    }

    private hasFolder(uri: URI): boolean {
        if (!this.folders) {
            return false;
        }
        return this.folders.some(folder => folder.uri.toString() === uri.toString());
    }

    getRelativePath(pathOrUri: string | theia.Uri, includeWorkspace?: boolean): string | undefined {
        let path: string | undefined;
        if (typeof pathOrUri === 'string') {
            path = pathOrUri;
        } else if (typeof pathOrUri !== 'undefined') {
            path = pathOrUri.fsPath;
        }

        if (!path) {
            return path;
        }

        const folder = this.getWorkspaceFolder(
            typeof pathOrUri === 'string' ? URI.file(pathOrUri) : pathOrUri,
            true
        ) as theia.WorkspaceFolder;

        if (!folder) {
            return path;
        }

        if (typeof includeWorkspace === 'undefined') {
            includeWorkspace = this.folders!.length > 1;
        }

        let result = relative(folder.uri.fsPath, path);
        if (includeWorkspace) {
            result = `${folder.name}/${result}`;
        }
        return normalize(result, true);
    }

}
