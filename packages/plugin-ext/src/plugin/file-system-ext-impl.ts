/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * **IMPORTANT** this code is running in the plugin host process and should be closed as possible to VS Code counterpart:
 * https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/workbench/api/common/extHostFileSystem.ts
 * One should be able to diff them to see differences.
 */

/* eslint-disable arrow-body-style */
/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable @typescript-eslint/tslint/config */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { URI, UriComponents } from '@theia/core/shared/vscode-uri';
import { RPCProtocol } from '../common/rpc-protocol';
import { PLUGIN_RPC_CONTEXT, FileSystemExt, FileSystemMain, IFileChangeDto } from '../common/plugin-api-rpc';
import * as vscode from '@theia/plugin';
import * as files from '@theia/filesystem/lib/common/files';
import { FileChangeType, FileSystemError } from './types-impl';
import * as typeConverter from './type-converters';
import { LanguagesExtImpl } from './languages';
import { Schemes as Schemas } from '../common/uri-components';
import { State, StateMachine, LinkComputer, Edge } from '../common/link-computer';
import { commonPrefixLength } from '@theia/core/lib/common/strings';
import { CharCode } from '@theia/core/lib/common/char-code';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';

type IDisposable = vscode.Disposable;

class FsLinkProvider {

    private _schemes: string[] = [];
    private _stateMachine?: StateMachine;

    add(scheme: string): void {
        this._stateMachine = undefined;
        this._schemes.push(scheme);
    }

    delete(scheme: string): void {
        const idx = this._schemes.indexOf(scheme);
        if (idx >= 0) {
            this._schemes.splice(idx, 1);
            this._stateMachine = undefined;
        }
    }

    private _initStateMachine(): void {
        if (!this._stateMachine) {

            // sort and compute common prefix with previous scheme
            // then build state transitions based on the data
            const schemes = this._schemes.sort();
            const edges: Edge[] = [];
            let prevScheme: string | undefined;
            let prevState: State;
            let lastState = State.LastKnownState;
            let nextState = State.LastKnownState;
            for (const scheme of schemes) {

                // skip the common prefix of the prev scheme
                // and continue with its last state
                let pos = !prevScheme ? 0 : commonPrefixLength(prevScheme, scheme);
                if (pos === 0) {
                    prevState = State.Start;
                } else {
                    prevState = nextState;
                }

                for (; pos < scheme.length; pos++) {
                    // keep creating new (next) states until the
                    // end (and the BeforeColon-state) is reached
                    if (pos + 1 === scheme.length) {
                        // Save the last state here, because we need to continue for the next scheme
                        lastState = nextState;
                        nextState = State.BeforeColon;
                    } else {
                        nextState += 1;
                    }
                    edges.push([prevState, scheme.toUpperCase().charCodeAt(pos), nextState]);
                    edges.push([prevState, scheme.toLowerCase().charCodeAt(pos), nextState]);
                    prevState = nextState;
                }

                prevScheme = scheme;
                // Restore the last state
                nextState = lastState;
            }

            // all link must match this pattern `<scheme>:/<more>`
            edges.push([State.BeforeColon, CharCode.Colon, State.AfterColon]);
            edges.push([State.AfterColon, CharCode.Slash, State.End]);

            this._stateMachine = new StateMachine(edges);
        }
    }

    provideDocumentLinks(document: vscode.TextDocument): vscode.ProviderResult<vscode.DocumentLink[]> {
        this._initStateMachine();

        const result: vscode.DocumentLink[] = [];
        const links = LinkComputer.computeLinks({
            getLineContent(lineNumber: number): string {
                return document.lineAt(lineNumber - 1).text;
            },
            getLineCount(): number {
                return document.lineCount;
            }
        }, this._stateMachine);

        for (const link of links) {
            const docLink = typeConverter.DocumentLink.to(link);
            if (docLink.target) {
                result.push(docLink);
            }
        }
        return result;
    }
}

class ConsumerFileSystem implements vscode.FileSystem {

    constructor(private _proxy: FileSystemMain) { }

    stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        return this._proxy.$stat(uri).catch(ConsumerFileSystem._handleError);
    }
    readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        return this._proxy.$readdir(uri).catch(ConsumerFileSystem._handleError);
    }
    createDirectory(uri: vscode.Uri): Promise<void> {
        return this._proxy.$mkdir(uri).catch(ConsumerFileSystem._handleError);
    }
    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return this._proxy.$readFile(uri).then(buff => buff.buffer).catch(ConsumerFileSystem._handleError);
    }
    writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        return this._proxy.$writeFile(uri, BinaryBuffer.wrap(content)).catch(ConsumerFileSystem._handleError);
    }
    delete(uri: vscode.Uri, options?: { recursive?: boolean; useTrash?: boolean; }): Promise<void> {
        return this._proxy.$delete(uri, { ...{ recursive: false, useTrash: false }, ...options }).catch(ConsumerFileSystem._handleError);
    }
    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options?: { overwrite?: boolean; }): Promise<void> {
        return this._proxy.$rename(oldUri, newUri, { ...{ overwrite: false }, ...options }).catch(ConsumerFileSystem._handleError);
    }
    copy(source: vscode.Uri, destination: vscode.Uri, options?: { overwrite?: boolean }): Promise<void> {
        return this._proxy.$copy(source, destination, { ...{ overwrite: false }, ...options }).catch(ConsumerFileSystem._handleError);
    }
    private static _handleError(err: any): never {
        // generic error
        if (!(err instanceof Error)) {
            throw new FileSystemError(String(err));
        }

        // no provider (unknown scheme) error
        if (err.name === 'ENOPRO') {
            throw FileSystemError.Unavailable(err.message);
        }

        // file system error
        switch (err.name) {
            case files.FileSystemProviderErrorCode.FileExists: throw FileSystemError.FileExists(err.message);
            case files.FileSystemProviderErrorCode.FileNotFound: throw FileSystemError.FileNotFound(err.message);
            case files.FileSystemProviderErrorCode.FileNotADirectory: throw FileSystemError.FileNotADirectory(err.message);
            case files.FileSystemProviderErrorCode.FileIsADirectory: throw FileSystemError.FileIsADirectory(err.message);
            case files.FileSystemProviderErrorCode.NoPermissions: throw FileSystemError.NoPermissions(err.message);
            case files.FileSystemProviderErrorCode.Unavailable: throw FileSystemError.Unavailable(err.message);

            default: throw new FileSystemError(err.message, err.name as files.FileSystemProviderErrorCode);
        }
    }
}

export class FileSystemExtImpl implements FileSystemExt {

    private readonly _proxy: FileSystemMain;
    private readonly _linkProvider = new FsLinkProvider();
    private readonly _fsProvider = new Map<number, vscode.FileSystemProvider>();
    private readonly _usedSchemes = new Set<string>();
    private readonly _watches = new Map<number, IDisposable>();

    private _linkProviderRegistration?: IDisposable;
    private _handlePool: number = 0;

    readonly fileSystem: vscode.FileSystem;

    constructor(rpc: RPCProtocol, private _extHostLanguageFeatures: LanguagesExtImpl) {
        this._proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.FILE_SYSTEM_MAIN);
        this.fileSystem = new ConsumerFileSystem(this._proxy);

        // register used schemes
        Object.keys(Schemas).forEach(scheme => this._usedSchemes.add(scheme));
    }

    dispose(): void {
        if (this._linkProviderRegistration) {
            this._linkProviderRegistration.dispose();
        }
    }

    private _registerLinkProviderIfNotYetRegistered(): void {
        if (!this._linkProviderRegistration) {
            this._linkProviderRegistration = this._extHostLanguageFeatures.registerDocumentLinkProvider('*', this._linkProvider, {
                id: 'theia.fs-ext-impl',
                name: 'fs-ext-impl'
            });
        }
    }

    registerFileSystemProvider(scheme: string, provider: vscode.FileSystemProvider, options: { isCaseSensitive?: boolean, isReadonly?: boolean } = {}) {

        if (this._usedSchemes.has(scheme)) {
            throw new Error(`a provider for the scheme '${scheme}' is already registered`);
        }

        //
        this._registerLinkProviderIfNotYetRegistered();

        const handle = this._handlePool++;
        this._linkProvider.add(scheme);
        this._usedSchemes.add(scheme);
        this._fsProvider.set(handle, provider);

        let capabilities = files.FileSystemProviderCapabilities.FileReadWrite;
        if (options.isCaseSensitive) {
            capabilities += files.FileSystemProviderCapabilities.PathCaseSensitive;
        }
        if (options.isReadonly) {
            capabilities += files.FileSystemProviderCapabilities.Readonly;
        }
        if (typeof provider.copy === 'function') {
            capabilities += files.FileSystemProviderCapabilities.FileFolderCopy;
        }
        if (typeof provider.open === 'function' && typeof provider.close === 'function'
            && typeof provider.read === 'function' && typeof provider.write === 'function'
        ) {
            capabilities += files.FileSystemProviderCapabilities.FileOpenReadWriteClose;
        }

        this._proxy.$registerFileSystemProvider(handle, scheme, capabilities);

        const subscription = provider.onDidChangeFile(event => {
            const mapped: IFileChangeDto[] = [];
            for (const e of event) {
                const { uri: resource, type } = e;
                if (resource.scheme !== scheme) {
                    // dropping events for wrong scheme
                    continue;
                }
                let newType: files.FileChangeType | undefined;
                switch (type) {
                    case FileChangeType.Changed:
                        newType = files.FileChangeType.UPDATED;
                        break;
                    case FileChangeType.Created:
                        newType = files.FileChangeType.ADDED;
                        break;
                    case FileChangeType.Deleted:
                        newType = files.FileChangeType.DELETED;
                        break;
                    default:
                        throw new Error('Unknown FileChangeType');
                }
                mapped.push({ resource, type: newType });
            }
            this._proxy.$onFileSystemChange(handle, mapped);
        });

        return {
            dispose: () => {
                subscription.dispose();
                this._linkProvider.delete(scheme);
                this._usedSchemes.delete(scheme);
                this._fsProvider.delete(handle);
                this._proxy.$unregisterProvider(handle);
            }
        };
    }

    private static _asIStat(stat: vscode.FileStat): files.Stat {
        const { type, ctime, mtime, size } = stat;
        return { type, ctime, mtime, size };
    }

    $stat(handle: number, resource: UriComponents): Promise<files.Stat> {
        return Promise.resolve(this._getFsProvider(handle).stat(URI.revive(resource))).then(FileSystemExtImpl._asIStat);
    }

    $readdir(handle: number, resource: UriComponents): Promise<[string, files.FileType][]> {
        return Promise.resolve(this._getFsProvider(handle).readDirectory(URI.revive(resource)));
    }

    $readFile(handle: number, resource: UriComponents): Promise<BinaryBuffer> {
        return Promise.resolve(this._getFsProvider(handle).readFile(URI.revive(resource))).then(data => BinaryBuffer.wrap(data));
    }

    $writeFile(handle: number, resource: UriComponents, content: BinaryBuffer, opts: files.FileWriteOptions): Promise<void> {
        return Promise.resolve(this._getFsProvider(handle).writeFile(URI.revive(resource), content.buffer, opts));
    }

    $delete(handle: number, resource: UriComponents, opts: files.FileDeleteOptions): Promise<void> {
        return Promise.resolve(this._getFsProvider(handle).delete(URI.revive(resource), opts));
    }

    $rename(handle: number, oldUri: UriComponents, newUri: UriComponents, opts: files.FileOverwriteOptions): Promise<void> {
        return Promise.resolve(this._getFsProvider(handle).rename(URI.revive(oldUri), URI.revive(newUri), opts));
    }

    $copy(handle: number, oldUri: UriComponents, newUri: UriComponents, opts: files.FileOverwriteOptions): Promise<void> {
        const provider = this._getFsProvider(handle);
        if (!provider.copy) {
            throw new Error('FileSystemProvider does not implement "copy"');
        }
        return Promise.resolve(provider.copy(URI.revive(oldUri), URI.revive(newUri), opts));
    }

    $mkdir(handle: number, resource: UriComponents): Promise<void> {
        return Promise.resolve(this._getFsProvider(handle).createDirectory(URI.revive(resource)));
    }

    $watch(handle: number, session: number, resource: UriComponents, opts: files.WatchOptions): void {
        const subscription = this._getFsProvider(handle).watch(URI.revive(resource), opts);
        this._watches.set(session, subscription);
    }

    $unwatch(_handle: number, session: number): void {
        const subscription = this._watches.get(session);
        if (subscription) {
            subscription.dispose();
            this._watches.delete(session);
        }
    }

    $open(handle: number, resource: UriComponents, opts: files.FileOpenOptions): Promise<number> {
        const provider = this._getFsProvider(handle);
        if (!provider.open) {
            throw new Error('FileSystemProvider does not implement "open"');
        }
        return Promise.resolve(provider.open(URI.revive(resource), opts));
    }

    $close(handle: number, fd: number): Promise<void> {
        const provider = this._getFsProvider(handle);
        if (!provider.close) {
            throw new Error('FileSystemProvider does not implement "close"');
        }
        return Promise.resolve(provider.close(fd));
    }

    $read(handle: number, fd: number, pos: number, length: number): Promise<BinaryBuffer> {
        const provider = this._getFsProvider(handle);
        if (!provider.read) {
            throw new Error('FileSystemProvider does not implement "read"');
        }
        const data = BinaryBuffer.alloc(length);
        return Promise.resolve(provider.read(fd, pos, data.buffer, 0, length)).then(read => {
            return data.slice(0, read); // don't send zeros
        });
    }

    $write(handle: number, fd: number, pos: number, data: BinaryBuffer): Promise<number> {
        const provider = this._getFsProvider(handle);
        if (!provider.write) {
            throw new Error('FileSystemProvider does not implement "write"');
        }
        return Promise.resolve(provider.write(fd, pos, data.buffer, 0, data.byteLength));
    }

    private _getFsProvider(handle: number): vscode.FileSystemProvider {
        const provider = this._fsProvider.get(handle);
        if (!provider) {
            const err = new Error();
            err.name = 'ENOPRO';
            err.message = `no provider`;
            throw err;
        }
        return provider;
    }
}
