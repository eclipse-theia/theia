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
 * https://github.com/microsoft/vscode/blob/04c36be045a94fee58e5f8992d3e3fd980294a84/src/vs/workbench/api/common/extHostFileSystemEventService.ts
 * One should be able to diff them to see differences.
 */

/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/tslint/config */

import { Emitter, WaitUntilEvent, AsyncEmitter } from '@theia/core/lib/common/event';
import { IRelativePattern, parse } from '@theia/callhierarchy/lib/common/glob';
import { URI, UriComponents } from '@theia/core/shared/vscode-uri';
import { EditorsAndDocumentsExtImpl as ExtHostDocumentsAndEditors } from './editors-and-documents';
import type * as vscode from '@theia/plugin';
import * as typeConverter from './type-converters';
import { Disposable, WorkspaceEdit } from './types-impl';
import { FileOperation } from '@theia/filesystem/lib/common/files';
import { flatten } from '../common/arrays';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import {
    Plugin, TextEditorsMain as MainThreadTextEditorsShape, PLUGIN_RPC_CONTEXT, FileSystemEvents, ExtHostFileSystemEventServiceShape,
    WorkspaceFileEditDto, WorkspaceTextEditDto
} from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';

type Event<T> = vscode.Event<T>;
type IExtensionDescription = Plugin;
type IWaitUntil = WaitUntilEvent;

class FileSystemWatcher implements vscode.FileSystemWatcher {

    private readonly _onDidCreate = new Emitter<vscode.Uri>();
    private readonly _onDidChange = new Emitter<vscode.Uri>();
    private readonly _onDidDelete = new Emitter<vscode.Uri>();
    private _disposable: Disposable;
    private _config: number;

    get ignoreCreateEvents(): boolean {
        return Boolean(this._config & 0b001);
    }

    get ignoreChangeEvents(): boolean {
        return Boolean(this._config & 0b010);
    }

    get ignoreDeleteEvents(): boolean {
        return Boolean(this._config & 0b100);
    }

    constructor(dispatcher: Event<FileSystemEvents>, globPattern: string | IRelativePattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean) {

        this._config = 0;
        if (ignoreCreateEvents) {
            this._config += 0b001;
        }
        if (ignoreChangeEvents) {
            this._config += 0b010;
        }
        if (ignoreDeleteEvents) {
            this._config += 0b100;
        }

        const parsedPattern = parse(globPattern);

        const subscription = dispatcher(events => {
            if (!ignoreCreateEvents) {
                for (const created of events.created) {
                    const uri = URI.revive(created);
                    if (parsedPattern(uri.fsPath)) {
                        this._onDidCreate.fire(uri);
                    }
                }
            }
            if (!ignoreChangeEvents) {
                for (const changed of events.changed) {
                    const uri = URI.revive(changed);
                    if (parsedPattern(uri.fsPath)) {
                        this._onDidChange.fire(uri);
                    }
                }
            }
            if (!ignoreDeleteEvents) {
                for (const deleted of events.deleted) {
                    const uri = URI.revive(deleted);
                    if (parsedPattern(uri.fsPath)) {
                        this._onDidDelete.fire(uri);
                    }
                }
            }
        });

        this._disposable = Disposable.from(this._onDidCreate, this._onDidChange, this._onDidDelete, subscription);
    }

    dispose() {
        this._disposable.dispose();
    }

    get onDidCreate(): Event<vscode.Uri> {
        return this._onDidCreate.event;
    }

    get onDidChange(): Event<vscode.Uri> {
        return this._onDidChange.event;
    }

    get onDidDelete(): Event<vscode.Uri> {
        return this._onDidDelete.event;
    }
}

interface IExtensionListener<E> {
    extension: IExtensionDescription;
    (e: E): any;
}

export class ExtHostFileSystemEventService implements ExtHostFileSystemEventServiceShape {

    private readonly _onFileSystemEvent = new Emitter<FileSystemEvents>();

    private readonly _onDidRenameFile = new Emitter<vscode.FileRenameEvent>();
    private readonly _onDidCreateFile = new Emitter<vscode.FileCreateEvent>();
    private readonly _onDidDeleteFile = new Emitter<vscode.FileDeleteEvent>();
    private readonly _onWillRenameFile = new AsyncEmitter<vscode.FileWillRenameEvent>();
    private readonly _onWillCreateFile = new AsyncEmitter<vscode.FileWillCreateEvent>();
    private readonly _onWillDeleteFile = new AsyncEmitter<vscode.FileWillDeleteEvent>();

    readonly onDidRenameFile: Event<vscode.FileRenameEvent> = this._onDidRenameFile.event;
    readonly onDidCreateFile: Event<vscode.FileCreateEvent> = this._onDidCreateFile.event;
    readonly onDidDeleteFile: Event<vscode.FileDeleteEvent> = this._onDidDeleteFile.event;

    constructor(
        rpc: RPCProtocol,
        private readonly _extHostDocumentsAndEditors: ExtHostDocumentsAndEditors,
        private readonly _mainThreadTextEditors: MainThreadTextEditorsShape = rpc.getProxy(PLUGIN_RPC_CONTEXT.TEXT_EDITORS_MAIN)
    ) {
        //
    }

    // --- file events

    createFileSystemWatcher(globPattern: string | IRelativePattern, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): vscode.FileSystemWatcher {
        return new FileSystemWatcher(this._onFileSystemEvent.event, globPattern, ignoreCreateEvents, ignoreChangeEvents, ignoreDeleteEvents);
    }

    $onFileEvent(events: FileSystemEvents) {
        this._onFileSystemEvent.fire(events);
    }

    // --- file operations

    $onDidRunFileOperation(operation: FileOperation, target: UriComponents, source: UriComponents | undefined): void {
        switch (operation) {
            case FileOperation.MOVE:
                this._onDidRenameFile.fire(Object.freeze({ files: [{ oldUri: URI.revive(source!), newUri: URI.revive(target) }] }));
                break;
            case FileOperation.DELETE:
                this._onDidDeleteFile.fire(Object.freeze({ files: [URI.revive(target)] }));
                break;
            case FileOperation.CREATE:
                this._onDidCreateFile.fire(Object.freeze({ files: [URI.revive(target)] }));
                break;
            default:
            // ignore, dont send
        }
    }

    getOnWillRenameFileEvent(extension: IExtensionDescription): Event<vscode.FileWillRenameEvent> {
        return this._createWillExecuteEvent(extension, this._onWillRenameFile);
    }

    getOnWillCreateFileEvent(extension: IExtensionDescription): Event<vscode.FileWillCreateEvent> {
        return this._createWillExecuteEvent(extension, this._onWillCreateFile);
    }

    getOnWillDeleteFileEvent(extension: IExtensionDescription): Event<vscode.FileWillDeleteEvent> {
        return this._createWillExecuteEvent(extension, this._onWillDeleteFile);
    }

    private _createWillExecuteEvent<E extends IWaitUntil>(extension: IExtensionDescription, emitter: AsyncEmitter<E>): Event<E> {
        return (listener, thisArg, disposables) => {
            const wrappedListener: IExtensionListener<E> = function wrapped(e: E) { listener.call(thisArg, e); };
            wrappedListener.extension = extension;
            return emitter.event(wrappedListener, undefined, disposables);
        };
    }

    async $onWillRunFileOperation(operation: FileOperation, target: UriComponents, source: UriComponents | undefined, timeout: number, token: CancellationToken): Promise<any> {
        switch (operation) {
            case FileOperation.MOVE:
                await this._fireWillEvent(this._onWillRenameFile, { files: [{ oldUri: URI.revive(source!), newUri: URI.revive(target) }] }, timeout, token);
                break;
            case FileOperation.DELETE:
                await this._fireWillEvent(this._onWillDeleteFile, { files: [URI.revive(target)] }, timeout, token);
                break;
            case FileOperation.CREATE:
                await this._fireWillEvent(this._onWillCreateFile, { files: [URI.revive(target)] }, timeout, token);
                break;
            default:
            // ignore, dont send
        }
    }

    private async _fireWillEvent<E extends IWaitUntil>(emitter: AsyncEmitter<E>, data: Omit<E, 'waitUntil'>, timeout: number, token: CancellationToken): Promise<any> {

        const edits: WorkspaceEdit[] = [];
        await emitter.fire(data, token, async (thenable, listener) => {
            // ignore all results except for WorkspaceEdits. Those are stored in an array.
            const now = Date.now();
            const result = await Promise.resolve(thenable);
            if (result instanceof WorkspaceEdit) {
                edits.push(result);
            }

            if (Date.now() - now > timeout) {
                console.warn('SLOW file-participant', (<IExtensionListener<E>>listener).extension?.model.id);
            }
        });

        if (token.isCancellationRequested) {
            return;
        }

        if (edits.length > 0) {
            // flatten all WorkspaceEdits collected via waitUntil-call
            // and apply them in one go.
            const allEdits = new Array<Array<WorkspaceFileEditDto | WorkspaceTextEditDto>>();
            for (const edit of edits) {
                const { edits } = typeConverter.fromWorkspaceEdit(edit, this._extHostDocumentsAndEditors);
                allEdits.push(edits);
            }
            return this._mainThreadTextEditors.$tryApplyWorkspaceEdit({ edits: flatten(allEdits) });
        }
    }
}
