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

import { CancellationToken, Disposable, Emitter, Event, URI } from '@theia/core';
import { UriComponents } from '@theia/core/lib/common/uri';
import { LanguageService } from '@theia/core/lib/browser/language-service';
import { CellExecuteUpdateDto, CellExecutionCompleteDto, MAIN_RPC_CONTEXT, NotebookKernelDto, NotebookKernelsExt, NotebookKernelsMain } from '../../../common';
import { RPCProtocol } from '../../../common/rpc-protocol';
import {
    CellExecution, NotebookEditorWidgetService, NotebookExecutionStateService,
    NotebookKernelChangeEvent, NotebookKernelService, NotebookService, NotebookKernel as NotebookKernelServiceKernel
} from '@theia/notebook/lib/browser';
import { interfaces } from '@theia/core/shared/inversify';
import { NotebookKernelSourceAction } from '@theia/notebook/lib/common';
import { NotebookDto } from './notebook-dto';

abstract class NotebookKernel implements NotebookKernelServiceKernel {
    private readonly onDidChangeEmitter = new Emitter<NotebookKernelChangeEvent>();
    private readonly preloads: { uri: URI; provides: readonly string[] }[];
    readonly onDidChange: Event<NotebookKernelChangeEvent> = this.onDidChangeEmitter.event;

    readonly id: string;
    readonly viewType: string;
    readonly extensionId: string;

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

    constructor(public readonly handle: number, data: NotebookKernelDto, private languageService: LanguageService) {
        this.id = data.id;
        this.viewType = data.notebookType;
        this.extensionId = data.extensionId;

        this.implementsInterrupt = data.supportsInterrupt ?? false;
        this.label = data.label;
        this.description = data.description;
        this.detail = data.detail;
        this.supportedLanguages = (data.supportedLanguages && data.supportedLanguages.length > 0) ? data.supportedLanguages : languageService.languages.map(lang => lang.id);
        this.implementsExecutionOrder = data.supportsExecutionOrder ?? false;
        this.localResourceRoot = URI.fromComponents(data.extensionLocation);
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

export interface KernelSourceActionProvider {
    readonly viewType: string;
    onDidChangeSourceActions?: Event<void>;
    provideKernelSourceActions(): Promise<NotebookKernelSourceAction[]>;
}

export class NotebookKernelsMainImpl implements NotebookKernelsMain {

    private readonly proxy: NotebookKernelsExt;

    private readonly kernels = new Map<number, [kernel: NotebookKernel, registration: Disposable]>();

    private readonly kernelDetectionTasks = new Map<number, [task: string, registration: Disposable]>();

    private readonly kernelSourceActionProviders = new Map<number, [provider: KernelSourceActionProvider, registration: Disposable]>();
    private readonly kernelSourceActionProvidersEventRegistrations = new Map<number, Disposable>();

    private notebookKernelService: NotebookKernelService;
    private notebookService: NotebookService;
    private languageService: LanguageService;
    private notebookExecutionStateService: NotebookExecutionStateService;
    private notebookEditorWidgetService: NotebookEditorWidgetService;

    private readonly executions = new Map<number, CellExecution>();

    constructor(
        rpc: RPCProtocol,
        container: interfaces.Container,
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.NOTEBOOK_KERNELS_EXT);

        this.notebookKernelService = container.get(NotebookKernelService);
        this.notebookExecutionStateService = container.get(NotebookExecutionStateService);
        this.notebookService = container.get(NotebookService);
        this.languageService = container.get(LanguageService);
        this.notebookEditorWidgetService = container.get(NotebookEditorWidgetService);

        this.notebookEditorWidgetService.onDidAddNotebookEditor(editor => {
            editor.onDidReceiveKernelMessage(async message => {
                const kernel = this.notebookKernelService.getSelectedOrSuggestedKernel(editor.model!);
                if (kernel) {
                    this.proxy.$acceptKernelMessageFromRenderer(kernel.handle, editor.id, message);
                }
            });
        });
        this.notebookKernelService.onDidChangeSelectedKernel(e => {
            if (e.newKernel) {
                const newKernelHandle = Array.from(this.kernels.entries()).find(([_, [kernel]]) => kernel.id === e.newKernel)?.[0];
                if (newKernelHandle !== undefined) {
                    this.proxy.$acceptNotebookAssociation(newKernelHandle, e.notebook.toComponents(), true);
                }
            } else {
                const oldKernelHandle = Array.from(this.kernels.entries()).find(([_, [kernel]]) => kernel.id === e.oldKernel)?.[0];
                if (oldKernelHandle !== undefined) {
                    this.proxy.$acceptNotebookAssociation(oldKernelHandle, e.notebook.toComponents(), false);
                }

            }
        });
    }

    async $postMessage(handle: number, editorId: string | undefined, message: unknown): Promise<boolean> {
        const tuple = this.kernels.get(handle);
        if (!tuple) {
            throw new Error('kernel already disposed');
        }
        const [kernel] = tuple;
        let didSend = false;
        for (const editor of this.notebookEditorWidgetService.getNotebookEditors()) {
            if (!editor.model) {
                continue;
            }
            if (this.notebookKernelService.getMatchingKernel(editor.model).selected !== kernel) {
                // different kernel
                continue;
            }
            if (editorId === undefined) {
                // all editors
                editor.postKernelMessage(message);
                didSend = true;
            } else if (editor.id === editorId) {
                // selected editors
                editor.postKernelMessage(message);
                didSend = true;
                break;
            }
        }
        return didSend;

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
        }(handle, data, this.languageService);

        // this is for when a kernel is bound to a notebook while being registered
        const autobindListener = this.notebookKernelService.onDidChangeSelectedKernel(e => {
            if (e.newKernel === kernel.id) {
                this.proxy.$acceptNotebookAssociation(handle, e.notebook.toComponents(), true);
            }
        });

        const registration = this.notebookKernelService.registerKernel(kernel);
        this.kernels.set(handle, [kernel, registration]);
        autobindListener.dispose();
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
        const execution = this.notebookExecutionStateService.getOrCreateCellExecution(uri, cellHandle);
        execution.confirm();
        this.executions.set(handle, execution);
    }

    $updateExecution(handle: number, updates: CellExecuteUpdateDto[]): void {
        const execution = this.executions.get(handle);
        execution?.update(updates.map(NotebookDto.fromCellExecuteUpdateDto));

    }
    $completeExecution(handle: number, data: CellExecutionCompleteDto): void {
        try {
            const execution = this.executions.get(handle);
            execution?.complete(NotebookDto.fromCellExecuteCompleteDto(data));
        } finally {
            this.executions.delete(handle);
        }

    }

    // TODO implement notebook execution (special api for executing full notebook instead of just cells)
    $createNotebookExecution(handle: number, controllerId: string, uri: UriComponents): void {
        throw new Error('Method not implemented.');
    }
    $beginNotebookExecution(handle: number): void {
        throw new Error('Method not implemented.');
    }
    $completeNotebookExecution(handle: number): void {
        throw new Error('Method not implemented.');
    }

    async $addKernelDetectionTask(handle: number, notebookType: string): Promise<void> {
        const registration = this.notebookKernelService.registerNotebookKernelDetectionTask(notebookType);
        this.kernelDetectionTasks.set(handle, [notebookType, registration]);
    }
    $removeKernelDetectionTask(handle: number): void {
        const tuple = this.kernelDetectionTasks.get(handle);
        if (tuple) {
            tuple[1].dispose();
            this.kernelDetectionTasks.delete(handle);
        }
    }
    async $addKernelSourceActionProvider(handle: number, eventHandle: number, notebookType: string): Promise<void> {
        const kernelSourceActionProvider: KernelSourceActionProvider = {
            viewType: notebookType,
            provideKernelSourceActions: async () => {
                const actions = await this.proxy.$provideKernelSourceActions(handle, CancellationToken.None);

                return actions.map(action => ({
                    label: action.label,
                    command: action.command,
                    description: action.description,
                    detail: action.detail,
                    documentation: action.documentation,
                }));
            }
        };

        if (typeof eventHandle === 'number') {
            const emitter = new Emitter<void>();
            this.kernelSourceActionProvidersEventRegistrations.set(eventHandle, emitter);
            kernelSourceActionProvider.onDidChangeSourceActions = emitter.event;
        }

        const registration = this.notebookKernelService.registerKernelSourceActionProvider(notebookType, kernelSourceActionProvider);
        this.kernelSourceActionProviders.set(handle, [kernelSourceActionProvider, registration]);
    }

    $removeKernelSourceActionProvider(handle: number, eventHandle: number): void {
        const tuple = this.kernelSourceActionProviders.get(handle);
        if (tuple) {
            tuple[1].dispose();
            this.kernelSourceActionProviders.delete(handle);
        }
        if (typeof eventHandle === 'number') {
            this.kernelSourceActionProvidersEventRegistrations.delete(eventHandle);
        }
    }
    $emitNotebookKernelSourceActionsChangeEvent(eventHandle: number): void {
    }

    dispose(): void {
        this.kernels.forEach(kernel => kernel[1].dispose());
    }

}
