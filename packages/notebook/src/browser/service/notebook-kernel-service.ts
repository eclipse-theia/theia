// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Event, URI } from '@theia/core';
import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';

export interface SelectedNotebooksChangeEvent {
    notebook: URI;
    oldKernel: string | undefined;
    newKernel: string | undefined;
}

export interface NotebookKernelMatchResult {
    readonly selected: NotebookKernel | undefined;
    readonly suggestions: NotebookKernel[];
    readonly all: NotebookKernel[];
    readonly hidden: NotebookKernel[];
}

export interface NotebookKernelChangeEvent {
    label?: true;
    description?: true;
    detail?: true;
    supportedLanguages?: true;
    hasExecutionOrder?: true;
    hasInterruptHandler?: true;
}

export interface NotebookKernel {
    readonly id: string;
    readonly viewType: string;
    readonly onDidChange: Event<Readonly<NotebookKernelChangeEvent>>;
    readonly extension: string;

    readonly localResourceRoot: URI;
    readonly preloadUris: URI[];
    readonly preloadProvides: string[];

    label: string;
    description?: string;
    detail?: string;
    supportedLanguages: string[];
    implementsInterrupt?: boolean;
    implementsExecutionOrder?: boolean;

    executeNotebookCellsRequest(uri: URI, cellHandles: number[]): Promise<void>;
    cancelNotebookCellExecution(uri: URI, cellHandles: number[]): Promise<void>;
}

export const enum ProxyKernelState {
    Disconnected = 1,
    Connected = 2,
    Initializing = 3
}

export interface INotebookProxyKernelChangeEvent extends NotebookKernelChangeEvent {
    connectionState?: true;
}

export interface NotebookTextModelLike { uri: URI; viewType: string }

export class NotebookKernelSerivce {

    private readonly onDidAddKernelEmitter = new Emitter<NotebookKernel>();
    readonly onDidAddKernel: Event<NotebookKernel> = this.onDidAddKernelEmitter.event;

    private readonly onDidRemoveKernelEmitter = new Emitter<NotebookKernel>();
    readonly onDidRemoveKernel: Event<NotebookKernel> = this.onDidRemoveKernelEmitter.event;

    private readonly onDidChangeSelectedNotebooksEmitter = new Emitter<SelectedNotebooksChangeEvent>();
    readonly onDidChangeSelectedNotebooks: Event<SelectedNotebooksChangeEvent> = this.onDidChangeSelectedNotebooksEmitter.event;

    private readonly onDidChangeNotebookAffinityEmitter = new Emitter<void>();
    readonly onDidChangeNotebookAffinity: Event<void> = this.onDidChangeNotebookAffinityEmitter.event;

    registerKernel(kernel: NotebookKernel): Disposable {
        throw new Error('Method not implemented.');
    }

    getMatchingKernel(notebook: NotebookTextModelLike): NotebookKernelMatchResult {
        throw new Error('Method not implemented.');
    }

}
