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

import {
    CellExecuteUpdateDto, NotebookKernelDto, NotebookKernelsExt, NotebookKernelsMain,
    NotebookKernelSourceActionDto, NotebookOutputDto, PluginModel, PLUGIN_RPC_CONTEXT
} from '../../common';
import { RPCProtocol } from '../../common/rpc-protocol';
import { UriComponents } from '../../common/uri-components';
import { CancellationTokenSource, Disposable, DisposableCollection, Emitter } from '@theia/core';
import { Cell } from './notebook-document';
import { NotebooksExtImpl } from './notebooks';
import { NotebookCellOutputConverter, NotebookCellOutputItem, NotebookKernelSourceAction } from '../type-converters';
import { timeout, Deferred } from '@theia/core/lib/common/promise-util';
import { CellExecutionUpdateType, NotebookCellExecutionState } from '@theia/notebook/lib/common';
import { CommandRegistryImpl } from '../command-registry';
import { NotebookCellOutput, NotebookRendererScript, URI } from '../types-impl';
import { toUriComponents } from '../../main/browser/hierarchy/hierarchy-types-converters';
import type * as theia from '@theia/plugin';
import { WebviewsExtImpl } from '../webviews';
import { WorkspaceExtImpl } from '../workspace';

interface KernelData {
    extensionId: string;
    controller: theia.NotebookController;
    onDidChangeSelection: Emitter<{ selected: boolean; notebook: theia.NotebookDocument }>;
    onDidReceiveMessage: Emitter<{ editor: theia.NotebookEditor; message: unknown }>;
    associatedNotebooks: Map<string, boolean>;
}

export class NotebookKernelsExtImpl implements NotebookKernelsExt {

    private readonly activeExecutions = new Map<string, NotebookCellExecutionTask>();

    private readonly kernelData = new Map<number, KernelData>();

    private readonly proxy: NotebookKernelsMain;

    private kernelDetectionTasks = new Map<number, theia.NotebookControllerDetectionTask>();
    private currentKernelDetectionTaskHandle = 0;

    private kernelSourceActionProviders = new Map<number, theia.NotebookKernelSourceActionProvider>();
    private currentSourceActionProviderHandle = 0;

    private readonly onDidChangeCellExecutionStateEmitter = new Emitter<theia.NotebookCellExecutionStateChangeEvent>();
    readonly onDidChangeNotebookCellExecutionState = this.onDidChangeCellExecutionStateEmitter.event;

    constructor(
        rpc: RPCProtocol,
        private readonly notebooks: NotebooksExtImpl,
        private readonly commands: CommandRegistryImpl,
        private readonly webviews: WebviewsExtImpl,
        workspace: WorkspaceExtImpl
    ) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.NOTEBOOK_KERNELS_MAIN);

        // call onDidChangeSelection for all kernels after trust is granted to inform extensions they can set the kernel as assoiciated
        // the jupyter extension for example does not set kernel association after trust is granted
        workspace.onDidGrantWorkspaceTrust(() => {
            this.kernelData.forEach(kernel => {
                kernel.associatedNotebooks.forEach(async (_, uri) => {
                    const notebook = await this.notebooks.waitForNotebookDocument(URI.parse(uri));
                    kernel.onDidChangeSelection.fire({ selected: true, notebook: notebook.apiNotebook });
                });
            });
        });
    }

    private currentHandle = 0;

    createNotebookController(extension: PluginModel, id: string, viewType: string, label: string, handler?: (cells: theia.NotebookCell[],
        notebook: theia.NotebookDocument, controller: theia.NotebookController) => void | Thenable<void>, rendererScripts?: NotebookRendererScript[]): theia.NotebookController {

        for (const kernelData of this.kernelData.values()) {
            if (kernelData.controller.id === id && extension.id === kernelData.extensionId) {
                throw new Error(`notebook controller with id '${id}' ALREADY exist`);
            }
        }

        const handle = this.currentHandle++;
        const that = this;

        console.debug(`NotebookController[${handle}], CREATED by ${extension.id}, ${id}`);

        const defaultExecuteHandler = () => console.warn(`NO execute handler from notebook controller '${data.id}' of extension: '${extension.id}'`);

        let isDisposed = false;
        const commandDisposables = new DisposableCollection();

        const onDidChangeSelection = new Emitter<{ selected: boolean; notebook: theia.NotebookDocument }>();
        const onDidReceiveMessage = new Emitter<{ editor: theia.NotebookEditor; message: unknown }>();

        const data: NotebookKernelDto = {
            id: createKernelId(extension.id, id),
            notebookType: viewType,
            extensionId: extension.id,
            extensionLocation: toUriComponents(extension.packageUri),
            label: label || extension.id,
            preloads: rendererScripts?.map(preload => ({ uri: toUriComponents(preload.uri.toString()), provides: preload.provides })) ?? []
        };

        //
        let executeHandler = handler ?? defaultExecuteHandler;
        let interruptHandler: ((this: theia.NotebookController, notebook: theia.NotebookDocument) => void | Thenable<void>) | undefined;

        this.proxy.$addKernel(handle, data).catch(err => {
            // this can happen when a kernel with that ID is already registered
            console.log(err);
            isDisposed = true;
        });

        // update: all setters write directly into the dto object
        // and trigger an update. the actual update will only happen
        // once per event loop execution
        let tokenPool = 0;
        const update = () => {
            if (isDisposed) {
                return;
            }
            const myToken = ++tokenPool;
            Promise.resolve().then(() => {
                if (myToken === tokenPool) {
                    this.proxy.$updateKernel(handle, data);
                }
            });
        };

        // notebook documents that are associated to this controller
        const associatedNotebooks = new Map<string, boolean>();

        const controller: theia.NotebookController = {
            get id(): string { return id; },
            get notebookType(): string { return data.notebookType; },
            onDidChangeSelectedNotebooks: onDidChangeSelection.event,
            get label(): string {
                return data.label;
            },
            set label(value) {
                data.label = value ?? extension.id;
                update();
            },
            get detail(): string {
                return data.detail ?? '';
            },
            set detail(value) {
                data.detail = value;
                update();
            },
            get description(): string {
                return data.description ?? '';
            },
            set description(value) {
                data.description = value;
                update();
            },
            get supportedLanguages(): string[] | undefined {
                return data.supportedLanguages;
            },
            set supportedLanguages(value) {
                data.supportedLanguages = value;
                update();
            },
            get supportsExecutionOrder(): boolean {
                return data.supportsExecutionOrder ?? false;
            },
            set supportsExecutionOrder(value) {
                data.supportsExecutionOrder = value;
                update();
            },
            get rendererScripts(): NotebookRendererScript[] {
                return data.preloads?.map(preload => (new NotebookRendererScript(URI.from(preload.uri), preload.provides))) ?? [];
            },
            get executeHandler(): (cells: theia.NotebookCell[], notebook: theia.NotebookDocument, controller: theia.NotebookController) => void | Thenable<void> {
                return executeHandler;
            },
            set executeHandler(value) {
                executeHandler = value ?? defaultExecuteHandler;
            },
            get interruptHandler(): ((this: theia.NotebookController, notebook: theia.NotebookDocument) => void | Thenable<void>) | undefined {
                return interruptHandler;
            },
            set interruptHandler(value) {
                interruptHandler = value;
                data.supportsInterrupt = Boolean(value);
                update();
            },
            createNotebookCellExecution(cell): theia.NotebookCellExecution {
                if (isDisposed) {
                    throw new Error('notebook controller is DISPOSED');
                }
                if (!associatedNotebooks.has(cell.notebook.uri.toString())) {
                    console.debug(`NotebookController[${handle}] NOT associated to notebook, associated to THESE notebooks:`,
                        Array.from(associatedNotebooks.keys()).map(u => u.toString()));
                    throw new Error(`notebook controller is NOT associated to notebook: ${cell.notebook.uri.toString()}`);
                }
                return that.createNotebookCellExecution(cell, createKernelId(extension.id, this.id));
            },
            dispose: () => {
                if (!isDisposed) {
                    console.debug(`NotebookController[${handle}], DISPOSED`);
                    isDisposed = true;
                    this.kernelData.delete(handle);
                    commandDisposables.dispose();
                    onDidChangeSelection.dispose();
                    onDidReceiveMessage.dispose();
                    this.proxy.$removeKernel(handle);
                }
            },
            updateNotebookAffinity(notebook, priority): void {
                that.proxy.$updateNotebookPriority(handle, notebook.uri, priority);
            },
            onDidReceiveMessage: onDidReceiveMessage.event,
            async postMessage(message: unknown, editor?: theia.NotebookEditor): Promise<boolean> {
                return that.proxy.$postMessage(handle, 'notebook:' + editor?.notebook.uri.toString(), message);
            },
            asWebviewUri(localResource: theia.Uri): theia.Uri {
                return that.webviews.toGeneralWebviewResource(extension, localResource);
            }
        };

        this.kernelData.set(handle, {
            extensionId: extension.id,
            controller,
            onDidReceiveMessage,
            onDidChangeSelection,
            associatedNotebooks
        });
        return controller;
    }

    createNotebookCellExecution(cell: theia.NotebookCell, controllerId: string): theia.NotebookCellExecution {
        if (cell.index < 0) {
            throw new Error('CANNOT execute cell that has been REMOVED from notebook');
        }
        const notebook = this.notebooks.getNotebookDocument(URI.from(cell.notebook.uri));
        const cellObj = notebook.getCellFromApiCell(cell);
        if (!cellObj) {
            throw new Error('invalid cell');
        }
        if (this.activeExecutions.has(cellObj.uri.toString())) {
            throw new Error(`duplicate execution for ${cellObj.uri}`);
        }
        const execution = new NotebookCellExecutionTask(controllerId, cellObj, this.proxy);
        this.activeExecutions.set(cellObj.uri.toString(), execution);
        const listener = execution.onDidChangeState(() => {
            if (execution.state === NotebookCellExecutionTaskState.Resolved) {
                execution.dispose();
                listener.dispose();
                this.activeExecutions.delete(cellObj.uri.toString());
            }
        });
        return execution.asApiObject();
    }

    createNotebookControllerDetectionTask(viewType: string): theia.NotebookControllerDetectionTask {
        const handle = this.currentKernelDetectionTaskHandle++;
        const that = this;

        this.proxy.$addKernelDetectionTask(handle, viewType);

        const detectionTask: theia.NotebookControllerDetectionTask = {
            dispose: () => {
                this.kernelDetectionTasks.delete(handle);
                that.proxy.$removeKernelDetectionTask(handle);
            }
        };

        this.kernelDetectionTasks.set(handle, detectionTask);
        return detectionTask;
    }

    registerKernelSourceActionProvider(viewType: string, provider: theia.NotebookKernelSourceActionProvider): Disposable {
        const handle = this.currentSourceActionProviderHandle++;
        const eventHandle = typeof provider.onDidChangeNotebookKernelSourceActions === 'function' ? handle : undefined;
        const that = this;

        this.kernelSourceActionProviders.set(handle, provider);
        this.proxy.$addKernelSourceActionProvider(handle, handle, viewType);

        let subscription: theia.Disposable | undefined;
        if (eventHandle !== undefined) {
            subscription = provider.onDidChangeNotebookKernelSourceActions!(_ => this.proxy.$emitNotebookKernelSourceActionsChangeEvent(eventHandle));
        }

        return {
            dispose: () => {
                this.kernelSourceActionProviders.delete(handle);
                that.proxy.$removeKernelSourceActionProvider(handle, handle);
                subscription?.dispose();
            }
        };
    }

    async $acceptNotebookAssociation(handle: number, uri: UriComponents, selected: boolean): Promise<void> {
        const obj = this.kernelData.get(handle);
        if (obj) {
            // update data structure
            const notebook = await this.notebooks.waitForNotebookDocument(URI.from(uri));
            if (selected) {
                obj.associatedNotebooks.set(notebook.uri.toString(), true);
            } else {
                obj.associatedNotebooks.delete(notebook.uri.toString());
            }
            console.debug(`NotebookController[${handle}] ASSOCIATE notebook`, notebook.uri.toString(), selected);
            // send event
            obj.onDidChangeSelection.fire({
                selected: selected,
                notebook: notebook.apiNotebook
            });
        }

    }

    async $executeCells(handle: number, uri: UriComponents, handles: number[]): Promise<void> {
        const obj = this.kernelData.get(handle);
        if (!obj) {
            // extension can dispose kernels in the meantime
            return Promise.resolve();
        }
        const document = await this.notebooks.waitForNotebookDocument(URI.from(uri));
        const cells: theia.NotebookCell[] = [];
        for (const cellHandle of handles) {
            const cell = document.getCell(cellHandle);
            if (cell) {
                cells.push(cell.apiCell);
            }
        }

        try {
            console.debug(`NotebookController[${handle}] EXECUTE cells`, document.uri.toString(), cells.length);
            await obj.controller.executeHandler.call(obj.controller, cells, document.apiNotebook, obj.controller);
        } catch (err) {
            console.error(`NotebookController[${handle}] execute cells FAILED`, err);
        }

    }

    async $cancelCells(handle: number, uri: UriComponents, handles: number[]): Promise<void> {
        const obj = this.kernelData.get(handle);
        if (!obj) {
            // extension can dispose kernels in the meantime
            return Promise.resolve();
        }

        // cancel or interrupt depends on the controller. When an interrupt handler is used we
        // don't trigger the cancelation token of executions.N
        const document = await this.notebooks.waitForNotebookDocument(URI.from(uri));
        if (obj.controller.interruptHandler) {
            await obj.controller.interruptHandler.call(obj.controller, document.apiNotebook);

        } else {
            for (const cellHandle of handles) {
                const cell = document.getCell(cellHandle);
                if (cell) {
                    this.activeExecutions.get(cell.uri.toString())?.cancel();
                }
            }
        }
    }

    $acceptKernelMessageFromRenderer(handle: number, editorId: string, message: unknown): void {
        const obj = this.kernelData.get(handle);
        if (!obj) {
            // extension can dispose kernels in the meantime
            return;
        }

        const editor = this.notebooks.getEditorById(editorId);
        obj.onDidReceiveMessage.fire(Object.freeze({ editor: editor.apiEditor, message }));
    }

    $cellExecutionChanged(uri: UriComponents, cellHandle: number, state: NotebookCellExecutionState | undefined): void {
        // Proposed Api though seems needed by jupyter for telemetry
    }

    async $provideKernelSourceActions(handle: number, token: theia.CancellationToken): Promise<NotebookKernelSourceActionDto[]> {
        const provider = this.kernelSourceActionProviders.get(handle);
        if (provider) {
            const disposables = new DisposableCollection();
            const ret = await provider.provideNotebookKernelSourceActions(token);
            return (ret ?? []).map(item => NotebookKernelSourceAction.from(item, this.commands.converter, disposables));
        }
        return [];

    }

}

enum NotebookCellExecutionTaskState {
    Init,
    Started,
    Resolved
}

class NotebookCellExecutionTask implements Disposable {
    private static HANDLE = 0;
    private _handle = NotebookCellExecutionTask.HANDLE++;

    private _onDidChangeState = new Emitter<void>();
    readonly onDidChangeState = this._onDidChangeState.event;

    private _state = NotebookCellExecutionTaskState.Init;
    get state(): NotebookCellExecutionTaskState { return this._state; }

    private readonly tokenSource = new CancellationTokenSource();

    private readonly collector: TimeoutBasedCollector<CellExecuteUpdateDto>;

    private executionOrder: number | undefined;

    constructor(
        controllerId: string,
        private readonly cell: Cell,
        private readonly proxy: NotebookKernelsMain
    ) {
        this.collector = new TimeoutBasedCollector(10, updates => this.update(updates));

        this.executionOrder = cell.internalMetadata.executionOrder;
        this.proxy.$createExecution(this._handle, controllerId, this.cell.notebookDocument.uri, this.cell.handle);
    }

    cancel(): void {
        this.tokenSource.cancel();
    }

    private async updateSoon(update: CellExecuteUpdateDto): Promise<void> {
        await this.collector.addItem(update);
    }

    private async update(update: CellExecuteUpdateDto | CellExecuteUpdateDto[]): Promise<void> {
        const updates = Array.isArray(update) ? update : [update];
        return this.proxy.$updateExecution(this._handle, updates);
    }

    private verifyStateForOutput(): void {
        if (this._state === NotebookCellExecutionTaskState.Init) {
            throw new Error('Must call start before modifying cell output');
        }

        if (this._state === NotebookCellExecutionTaskState.Resolved) {
            throw new Error('Cannot modify cell output after calling resolve');
        }
    }

    private cellIndexToHandle(cellOrCellIndex: theia.NotebookCell | undefined): number {
        let cell: Cell | undefined = this.cell;
        if (cellOrCellIndex) {
            cell = this.cell.notebookDocument.getCellFromApiCell(cellOrCellIndex);
        }
        if (!cell) {
            throw new Error('INVALID cell');
        }
        return cell.handle;
    }

    private validateAndConvertOutputs(items: NotebookCellOutput[]): NotebookOutputDto[] {
        return items.map(output => {
            const newOutput = NotebookCellOutputConverter.ensureUniqueMimeTypes(output.items, true);
            if (newOutput === output.items) {
                return NotebookCellOutputConverter.from(output);
            }
            return NotebookCellOutputConverter.from({
                items: newOutput,
                outputId: output.outputId,
                metadata: output.metadata
            });
        });
    }

    private async updateOutputs(outputs: NotebookCellOutput | NotebookCellOutput[], cell: theia.NotebookCell | undefined, append: boolean): Promise<void> {
        const handle = this.cellIndexToHandle(cell);
        const outputDtos = this.validateAndConvertOutputs(Array.isArray(outputs) ? outputs : [outputs]);
        return this.updateSoon(
            {
                editType: CellExecutionUpdateType.Output,
                cellHandle: handle,
                append,
                outputs: outputDtos
            });
    }

    private async updateOutputItems(items: theia.NotebookCellOutputItem | theia.NotebookCellOutputItem[],
        output: theia.NotebookCellOutput, append: boolean): Promise<void> {
        items = NotebookCellOutputConverter.ensureUniqueMimeTypes(Array.isArray(items) ? items : [items], true);
        return this.updateSoon({
            editType: CellExecutionUpdateType.OutputItems,
            items: items.map(NotebookCellOutputItem.from),
            outputId: output instanceof NotebookCellOutput ? output.outputId : '',
            append
        });
    }

    asApiObject(): theia.NotebookCellExecution {
        const that = this;
        const result: theia.NotebookCellExecution = {
            get token(): theia.CancellationToken { return that.tokenSource.token; },
            get cell(): theia.NotebookCell { return that.cell.apiCell; },
            get executionOrder(): number | undefined { return that.executionOrder; },
            set executionOrder(v: number | undefined) {
                that.executionOrder = v;
                that.update([{
                    editType: CellExecutionUpdateType.ExecutionState,
                    executionOrder: that.executionOrder
                }]);
            },

            start(startTime?: number): void {
                if (that._state === NotebookCellExecutionTaskState.Resolved || that._state === NotebookCellExecutionTaskState.Started) {
                    throw new Error('Cannot call start again');
                }

                that._state = NotebookCellExecutionTaskState.Started;
                that._onDidChangeState.fire();

                that.update({
                    editType: CellExecutionUpdateType.ExecutionState,
                    runStartTime: startTime
                });
            },

            end(success: boolean | undefined, endTime?: number): void {
                if (that._state === NotebookCellExecutionTaskState.Resolved) {
                    throw new Error('Cannot call resolve twice');
                }

                that._state = NotebookCellExecutionTaskState.Resolved;
                that._onDidChangeState.fire();

                // The last update needs to be ordered correctly and applied immediately,
                // so we use updateSoon and immediately flush.
                that.collector.flush();

                that.proxy.$completeExecution(that._handle, {
                    runEndTime: endTime,
                    lastRunSuccess: success
                });
            },

            clearOutput(cell?: theia.NotebookCell): Thenable<void> {
                that.verifyStateForOutput();
                return that.updateOutputs([], cell, false);
            },

            appendOutput(outputs: NotebookCellOutput | NotebookCellOutput[], cell?: theia.NotebookCell): Promise<void> {
                that.verifyStateForOutput();
                return that.updateOutputs(outputs, cell, true);
            },

            replaceOutput(outputs: NotebookCellOutput | NotebookCellOutput[], cell?: theia.NotebookCell): Promise<void> {
                that.verifyStateForOutput();
                return that.updateOutputs(outputs, cell, false);
            },

            appendOutputItems(items: theia.NotebookCellOutputItem | theia.NotebookCellOutputItem[], output: theia.NotebookCellOutput): Promise<void> {
                that.verifyStateForOutput();
                return that.updateOutputItems(items, output, true);
            },

            replaceOutputItems(items: theia.NotebookCellOutputItem | theia.NotebookCellOutputItem[], output: theia.NotebookCellOutput): Promise<void> {
                that.verifyStateForOutput();
                return that.updateOutputItems(items, output, false);
            }
        };
        return Object.freeze(result);
    }

    dispose(): void {

    }
}

class TimeoutBasedCollector<T> {
    private batch: T[] = [];
    private startedTimer = Date.now();
    private currentDeferred: Deferred<void> | undefined;

    constructor(
        private readonly delay: number,
        private readonly callback: (items: T[]) => Promise<void>) { }

    addItem(item: T): Promise<void> {
        this.batch.push(item);
        if (!this.currentDeferred) {
            this.currentDeferred = new Deferred<void>();
            this.startedTimer = Date.now();
            timeout(this.delay).then(() => this.flush());
        }

        // This can be called by the extension repeatedly for a long time before the timeout is able to run.
        // Force a flush after the delay.
        if (Date.now() - this.startedTimer > this.delay) {
            return this.flush();
        }

        return this.currentDeferred.promise;
    }

    flush(): Promise<void> {
        if (this.batch.length === 0 || !this.currentDeferred) {
            return Promise.resolve();
        }

        const deferred = this.currentDeferred;
        this.currentDeferred = undefined;
        const batch = this.batch;
        this.batch = [];
        return this.callback(batch)
            .finally(() => deferred.resolve());
    }
}

export function createKernelId(extensionIdentifier: string, id: string): string {
    return `${extensionIdentifier}/${id}`;
}
