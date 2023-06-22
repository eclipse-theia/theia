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

import { Emitter, Event, URI } from '@theia/core';
import { UriComponents } from '@theia/core/lib/common/uri';
import { LanguageService } from '@theia/core/lib/browser/language-service';
import { CellExecutionCompleteDto, CellExecutionStateUpdateDto, MAIN_RPC_CONTEXT, NotebookKernelDto, NotebookKernelsExt, NotebookKernelsMain } from '../../../common';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { NotebookKernelChangeEvent, NotebookKernelSerivce, NotebookService } from '@theia/notebook/lib/browser';
import { Disposable } from '@theia/core/shared/vscode-languageserver-protocol';
import { combinedDisposable } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { interfaces } from '@theia/core/shared/inversify';
import { NotebookCellExecution } from '@theia/plugin';

abstract class NotebookKernel {
    private readonly onDidChangeEmitter = new Emitter<NotebookKernelChangeEvent>();
    private readonly preloads: { uri: URI; provides: readonly string[] }[];
    readonly onDidChange: Event<NotebookKernelChangeEvent> = this.onDidChangeEmitter.event;

    readonly id: string;
    readonly viewType: string;
    readonly extension: string;

    implementsInterrupt: boolean;
    label: string;
    description?: string;
    detail?: string;
    supportedLanguages: string[];
    implementsExecutionOrder: boolean;
    localResourceRoot: URI;

    public get preloadUris(): URI[] {
        return this.preloads.map(p => p.uri);
    }

    public get preloadProvides(): string[] {
        return this.preloads.map(p => p.provides).flat();
    }

    constructor(data: NotebookKernelDto, private languageService: LanguageService) {
        this.id = data.id;
        this.viewType = data.notebookType;
        this.extension = data.extensionId;

        this.implementsInterrupt = data.supportsInterrupt ?? false;
        this.label = data.label;
        this.description = data.description;
        this.detail = data.detail;
        this.supportedLanguages = (data.supportedLanguages && data.supportedLanguages.length > 0) ? data.supportedLanguages : languageService.languages.map(lang => lang.id);
        this.implementsExecutionOrder = data.supportsExecutionOrder ?? false;
        this.preloads = data.preloads?.map(u => ({ uri: URI.fromComponents(u.uri), provides: u.provides })) ?? [];
    }

    update(data: Partial<NotebookKernelDto>): void {

        const event: NotebookKernelChangeEvent = Object.create(null);
        if (data.label !== undefined) {
            this.label = data.label;
            event.label = true;
        }
        if (data.description !== undefined) {
            this.description = data.description;
            event.description = true;
        }
        if (data.detail !== undefined) {
            this.detail = data.detail;
            event.detail = true;
        }
        if (data.supportedLanguages !== undefined) {
            this.supportedLanguages = (data.supportedLanguages && data.supportedLanguages.length > 0) ?
                data.supportedLanguages :
                this.languageService.languages.map(lang => lang.id);
            event.supportedLanguages = true;
        }
        if (data.supportsExecutionOrder !== undefined) {
            this.implementsExecutionOrder = data.supportsExecutionOrder;
            event.hasExecutionOrder = true;
        }
        if (data.supportsInterrupt !== undefined) {
            this.implementsInterrupt = data.supportsInterrupt;
            event.hasInterruptHandler = true;
        }
        this.onDidChangeEmitter.fire(event);
    }

    abstract executeNotebookCellsRequest(uri: URI, cellHandles: number[]): Promise<void>;
    abstract cancelNotebookCellExecution(uri: URI, cellHandles: number[]): Promise<void>;
}

export class NotebookKernelsMainImpl implements NotebookKernelsMain {

    private readonly proxy: NotebookKernelsExt;

    private readonly kernels = new Map<number, [kernel: NotebookKernel, registraion: Disposable]>();

    private notebookKernelService: NotebookKernelSerivce;
    private notebookService: NotebookService;
    private languageService: LanguageService;

    private readonly executions = new Map<number, NotebookCellExecution>();

    constructor(
        rpc: RPCProtocol,
        container: interfaces.Container,
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.NOTEBOOK_KERNELS_EXT);

        this.notebookKernelService = container.get(NotebookKernelSerivce);
        this.notebookService = container.get(NotebookService);
        this.languageService = container.get(LanguageService);
    }

    $postMessage(handle: number, editorId: string | undefined, message: unknown): Promise<boolean> {
        throw new Error('Method not implemented.');
    }

    async $addKernel(handle: number, data: NotebookKernelDto): Promise<void> {
        const that = this;
        const kernel = new class extends NotebookKernel {
            async executeNotebookCellsRequest(uri: URI, handles: number[]): Promise<void> {
                await that.proxy.$executeCells(handle, uri.toComponents(), handles);
            }
            async cancelNotebookCellExecution(uri: URI, handles: number[]): Promise<void> {
                await that.proxy.$cancelCells(handle, uri.toComponents(), handles);
            }
        }(data, this.languageService);

        const listener = this.notebookKernelService.onDidChangeSelectedNotebooks(e => {
            if (e.oldKernel === kernel.id) {
                this.proxy.$acceptNotebookAssociation(handle, e.notebook.toComponents(), false);
            } else if (e.newKernel === kernel.id) {
                this.proxy.$acceptNotebookAssociation(handle, e.notebook.toComponents(), true);
            }
        });

        const registration = this.notebookKernelService.registerKernel(kernel);
        this.kernels.set(handle, [kernel, combinedDisposable(listener, registration)]);

    }

    $updateKernel(handle: number, data: Partial<NotebookKernelDto>): void {
        const tuple = this.kernels.get(handle);
        if (tuple) {
            tuple[0].update(data);
        }
    }

    $removeKernel(handle: number): void {
        const tuple = this.kernels.get(handle);
        if (tuple) {
            tuple[1].dispose();
            this.kernels.delete(handle);
        }
    }

    $updateNotebookPriority(handle: number, uri: UriComponents, value: number | undefined): void {
        throw new Error('Method not implemented.');
    }
    $createExecution(handle: number, controllerId: string, uriComponents: UriComponents, cellHandle: number): void {
        const uri = URI.fromComponents(uriComponents);
        const notebook = this.notebookService.getNotebookEditorModel(uri);
        if (!notebook) {
            throw new Error(`Notebook not found: ${uri.toString()}`);
        }

        const kernel = this.notebookKernelService.getMatchingKernel(notebook);
        if (!kernel.selected || kernel.selected.id !== controllerId) {
            throw new Error(`Kernel is not selected: ${kernel.selected?.id} !== ${controllerId}`);
        }
        const execution = this.notebookExecutionStateService.createCellExecution(uri, cellHandle);
        execution.confirm();
        this.executions.set(handle, execution);
    }
    $updateExecution(handle: number, data: CellExecutionStateUpdateDto[]): void {
        throw new Error('Method not implemented.');
    }
    $completeExecution(handle: number, data: CellExecutionCompleteDto): void {
        throw new Error('Method not implemented.');
    }
    $createNotebookExecution(handle: number, controllerId: string, uri: UriComponents): void {
        throw new Error('Method not implemented.');
    }
    $beginNotebookExecution(handle: number): void {
        throw new Error('Method not implemented.');
    }
    $completeNotebookExecution(handle: number): void {
        throw new Error('Method not implemented.');
    }
    $addKernelDetectionTask(handle: number, notebookType: string): Promise<void> {
        throw new Error('Method not implemented.');
    }
    $removeKernelDetectionTask(handle: number): void {
        throw new Error('Method not implemented.');
    }
    $addKernelSourceActionProvider(handle: number, eventHandle: number, notebookType: string): Promise<void> {
        throw new Error('Method not implemented.');
    }
    $removeKernelSourceActionProvider(handle: number, eventHandle: number): void {
        throw new Error('Method not implemented.');
    }
    $emitNotebookKernelSourceActionsChangeEvent(eventHandle: number): void {
        throw new Error('Method not implemented.');
    }

    dispose(): void {
        this.kernels.forEach(kernel => kernel[1].dispose());
    }

}
