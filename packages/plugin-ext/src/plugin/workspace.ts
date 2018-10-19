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

import {
    WorkspaceFolder,
    WorkspaceFoldersChangeEvent,
    WorkspaceFolderPickOptions,
    GlobPattern,
    FileSystemWatcher,
    TextDocumentContentProvider,
    Disposable as PluginDisposable
} from '@theia/plugin';
import { Disposable } from './types-impl';
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
import URI from 'vscode-uri';
import { UriComponents } from '../common/uri-components';
import { EditorsAndDocumentsExtImpl } from './editors-and-documents';

export class WorkspaceExtImpl implements WorkspaceExt {

    private proxy: WorkspaceMain;

    private editorsAndDocuments: EditorsAndDocumentsExtImpl;

    private handlePool = 0;

    private documentContentProviders = new Map<number, TextDocumentContentProvider>();

    private workspaceFoldersChangedEmitter = new Emitter<WorkspaceFoldersChangeEvent>();
    public readonly onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent> = this.workspaceFoldersChangedEmitter.event;

    private folders: WorkspaceFolder[] | undefined;

    constructor(rpc: RPCProtocol, editorsAndDocuments: EditorsAndDocumentsExtImpl) {
        this.proxy = rpc.getProxy(Ext.WORKSPACE_MAIN);
        this.editorsAndDocuments = editorsAndDocuments;
    }

    get workspaceFolders(): WorkspaceFolder[] | undefined {
        return this.folders;
    }

    get name(): string | undefined {
        if (this.workspaceFolders) {
            return new Path(this.workspaceFolders[0].uri.path).base;
        }

        return undefined;
    }

    $onWorkspaceFoldersChanged(event: WorkspaceFoldersChangeEvent): void {
        this.folders = event.added;
        this.workspaceFoldersChangedEmitter.fire(event);
    }

    pickWorkspaceFolder(options?: WorkspaceFolderPickOptions): PromiseLike<WorkspaceFolder | undefined> {
        return new Promise((resolve, reject) => {
            const optionsMain = {
                placeHolder: options && options.placeHolder ? options.placeHolder : undefined,
                ignoreFocusOut: options && options.ignoreFocusOut
            } as WorkspaceFolderPickOptionsMain;

            this.proxy.$pickWorkspaceFolder(optionsMain).then(value => {
                resolve(value);
            });
        });
    }

    registerTextDocumentContentProvider(scheme: string, provider: TextDocumentContentProvider): Disposable {
        // todo@remote
        // check with scheme from fs-providers!
        if (scheme === 'file' || scheme === 'untitled') {
            throw new Error(`scheme '${scheme}' already registered`);
        }

        const handle = this.handlePool++;

        this.documentContentProviders.set(handle, provider);
        this.proxy.$registerTextDocumentContentProvider(handle, scheme);

        let subscription: PluginDisposable;
        if (typeof provider.onDidChange === 'function') {
            subscription = provider.onDidChange(uri => {
                if (uri.scheme !== scheme) {
                    console.warn(`Provider for scheme '${scheme}' is firing event for schema '${uri.scheme}' which will be IGNORED`);
                    return;
                }
                if (this.editorsAndDocuments.getDocument(uri.toString())) {
                    this.$provideTextDocumentContent(handle, uri).then(value => {

                        const document = this.editorsAndDocuments.getDocument(uri.toString());
                        if (!document || !value) {
                            // disposed in the meantime
                            return;
                        }

                        // create lines and compare
                        const lines = value.split(/\r\n|\r|\n/);

                        // broadcast event when content changed
                        if (!document.equalLines(lines)) {
                            return this.proxy.$onVirtualDocumentChange(uri, value);
                        }

                    }, error => this.onUnexpectedError(error));
                }
            });
        }
        return new Disposable(() => {
            if (this.documentContentProviders.delete(handle)) {
                this.proxy.$unregisterTextContentProvider(handle);
            }
            if (subscription) {
                subscription.dispose();
            }
        });
    }

    onUnexpectedError(e: any): undefined {
        // ignore errors from cancelled promises
        console.error(e);
        return undefined;
    }

    $provideTextDocumentContent(handle: number, uri: UriComponents): Promise<string | undefined> {
        const provider = this.documentContentProviders.get(handle);
        if (!provider) {
            return Promise.reject(new Error(`unsupported uri-scheme: ${uri.scheme}`));
        }
        return Promise.resolve(provider.provideTextDocumentContent(URI.revive(uri), CancellationToken.None));
    }

    findFiles(include: GlobPattern, exclude?: GlobPattern | undefined, maxResults?: number,
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

    createFileSystemWatcher(globPattern: GlobPattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): FileSystemWatcher {
        // FIXME: to implement
        return new Proxy(<FileSystemWatcher>{}, {});
    }

}
