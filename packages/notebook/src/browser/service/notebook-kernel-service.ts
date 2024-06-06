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

import { Command, CommandService, Disposable, Emitter, Event, URI } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { StorageService } from '@theia/core/lib/browser';
import { NotebookKernelSourceAction } from '../../common';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookService } from './notebook-service';

export interface SelectedNotebookKernelChangeEvent {
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
    // ID of the extension providing this kernel
    readonly extensionId: string;

    readonly localResourceRoot: URI;
    readonly preloadUris: URI[];
    readonly preloadProvides: string[];

    readonly handle: number;
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

class KernelInfo {

    protected static instanceCounter = 0;

    score: number;
    readonly kernel: NotebookKernel;
    readonly handle: number;

    constructor(kernel: NotebookKernel) {
        this.kernel = kernel;
        this.score = -1;
        this.handle = KernelInfo.instanceCounter++;
    }
}

export interface NotebookSourceActionChangeEvent {
    notebook?: URI;
    viewType: string;
}

export interface KernelSourceActionProvider {
    readonly viewType: string;
    onDidChangeSourceActions?: Event<void>;
    provideKernelSourceActions(): Promise<NotebookKernelSourceAction[]>;
}

export class SourceCommand implements Disposable {
    execution: Promise<void> | undefined;
    protected readonly onDidChangeStateEmitter = new Emitter<void>();
    readonly onDidChangeState = this.onDidChangeStateEmitter.event;

    constructor(
        readonly command: Command,
        readonly model: NotebookTextModelLike,
    ) { }

    async run(commandService: CommandService): Promise<void> {
        if (this.execution) {
            return this.execution;
        }

        this.execution = this.runCommand(commandService);
        this.onDidChangeStateEmitter.fire();
        await this.execution;
        this.execution = undefined;
        this.onDidChangeStateEmitter.fire();
    }

    protected async runCommand(commandService: CommandService): Promise<void> {
        try {
            await commandService.executeCommand(this.command.id, {
                uri: this.model.uri,
            });

        } catch (error) {
            console.warn(`Kernel source command failed: ${error}`);
        }
    }

    dispose(): void {
        this.onDidChangeStateEmitter.dispose();
    }

}

const NOTEBOOK_KERNEL_BINDING_STORAGE_KEY = 'notebook.kernel.bindings';
@injectable()
export class NotebookKernelService {

    @inject(NotebookService)
    protected notebookService: NotebookService;

    @inject(StorageService)
    protected storageService: StorageService;

    protected readonly kernels = new Map<string, KernelInfo>();

    protected notebookBindings: Record<string, string> = {};

    protected readonly kernelDetectionTasks = new Map<string, string[]>();
    protected readonly onDidChangeKernelDetectionTasksEmitter = new Emitter<string>();
    readonly onDidChangeKernelDetectionTasks = this.onDidChangeKernelDetectionTasksEmitter.event;

    protected readonly onDidChangeSourceActionsEmitter = new Emitter<NotebookSourceActionChangeEvent>();
    protected readonly kernelSourceActionProviders = new Map<string, KernelSourceActionProvider[]>();
    readonly onDidChangeSourceActions: Event<NotebookSourceActionChangeEvent> = this.onDidChangeSourceActionsEmitter.event;

    protected readonly onDidAddKernelEmitter = new Emitter<NotebookKernel>();
    readonly onDidAddKernel: Event<NotebookKernel> = this.onDidAddKernelEmitter.event;

    protected readonly onDidRemoveKernelEmitter = new Emitter<NotebookKernel>();
    readonly onDidRemoveKernel: Event<NotebookKernel> = this.onDidRemoveKernelEmitter.event;

    protected readonly onDidChangeSelectedNotebookKernelBindingEmitter = new Emitter<SelectedNotebookKernelChangeEvent>();
    readonly onDidChangeSelectedKernel: Event<SelectedNotebookKernelChangeEvent> = this.onDidChangeSelectedNotebookKernelBindingEmitter.event;

    protected readonly onDidChangeNotebookAffinityEmitter = new Emitter<void>();
    readonly onDidChangeNotebookAffinity: Event<void> = this.onDidChangeNotebookAffinityEmitter.event;

    @postConstruct()
    init(): void {
        this.notebookService.onDidAddNotebookDocument(model => this.tryAutoBindNotebook(model));
        this.storageService.getData(NOTEBOOK_KERNEL_BINDING_STORAGE_KEY).then((value: Record<string, string> | undefined) => {
            if (value) {
                this.notebookBindings = value;
            }
        });
    }

    registerKernel(kernel: NotebookKernel): Disposable {
        if (this.kernels.has(kernel.id)) {
            throw new Error(`Notebook Controller with id '${kernel.id}' already exists`);
        }

        this.kernels.set(kernel.id, new KernelInfo(kernel));
        this.onDidAddKernelEmitter.fire(kernel);

        // auto associate the new kernel to existing notebooks it was
        // associated to in the past.
        for (const notebook of this.notebookService.getNotebookModels()) {
            this.tryAutoBindNotebook(notebook, kernel);
        }

        return Disposable.create(() => {
            if (this.kernels.delete(kernel.id)) {
                this.onDidRemoveKernelEmitter.fire(kernel);
            }
        });
    }

    /**
     * Helps to find the best matching kernel for a notebook.
     * @param notebook notebook to get the matching kernel for
     * @returns and object containing:
     *  all kernels sorted to match the notebook best first (affinity ascending, score descending, label))
     *  the selected kernel (if any)
     *  specific suggested kernels (if any)
     *  hidden kernels (if any)
     */
    getMatchingKernel(notebook: NotebookTextModelLike): NotebookKernelMatchResult {
        const kernels: { kernel: NotebookKernel; instanceAffinity: number; score: number }[] = [];
        for (const info of this.kernels.values()) {
            const score = NotebookKernelService.score(info.kernel, notebook);
            if (score) {
                kernels.push({
                    score,
                    kernel: info.kernel,
                    instanceAffinity: 1 /* vscode.NotebookControllerPriority.Default */,
                });
            }
        }

        kernels
            .sort((a, b) => b.instanceAffinity - a.instanceAffinity || a.score - b.score || a.kernel.label.localeCompare(b.kernel.label));
        const all = kernels.map(obj => obj.kernel);

        // bound kernel
        const selected = this.getSelectedNotebookKernel(notebook);
        const suggestions = kernels.filter(item => item.instanceAffinity > 1).map(item => item.kernel); // TODO implement notebookAffinity
        const hidden = kernels.filter(item => item.instanceAffinity < 0).map(item => item.kernel);
        return { all, selected, suggestions, hidden };

    }

    getSelectedNotebookKernel(notebook: NotebookTextModelLike): NotebookKernel | undefined {
        const selectedId = this.notebookBindings[`${notebook.viewType}/${notebook.uri}`];
        return selectedId ? this.kernels.get(selectedId)?.kernel : undefined;
    }

    selectKernelForNotebook(kernel: NotebookKernel | undefined, notebook: NotebookTextModelLike): void {
        const key = `${notebook.viewType}/${notebook.uri}`;
        const oldKernel = this.notebookBindings[key];
        if (oldKernel !== kernel?.id) {
            if (kernel) {
                this.notebookBindings[key] = kernel.id;
            } else {
                delete this.notebookBindings[key];
            }
            this.storageService.setData(NOTEBOOK_KERNEL_BINDING_STORAGE_KEY, this.notebookBindings);
            this.onDidChangeSelectedNotebookKernelBindingEmitter.fire({ notebook: notebook.uri, oldKernel, newKernel: kernel?.id });
        }
    }

    getSelectedOrSuggestedKernel(notebook: NotebookModel): NotebookKernel | undefined {
        const info = this.getMatchingKernel(notebook);
        if (info.selected) {
            return info.selected;
        }

        return info.all.length === 1 ? info.all[0] : undefined;
    }

    getKernel(id: string): NotebookKernel | undefined {
        return this.kernels.get(id)?.kernel;
    }

    protected static score(kernel: NotebookKernel, notebook: NotebookTextModelLike): number {
        if (kernel.viewType === notebook.viewType) {
            return 10;
        } else if (kernel.viewType === '*') {
            return 5;
        } else {
            return 0;
        }
    }

    protected tryAutoBindNotebook(notebook: NotebookModel, onlyThisKernel?: NotebookKernel): void {

        const id = this.notebookBindings[`${notebook.viewType}/${notebook.uri}`];
        if (!id) {
            // no kernel associated
            return;
        }
        const existingKernel = this.kernels.get(id);
        if (!existingKernel || !NotebookKernelService.score(existingKernel.kernel, notebook)) {
            // associated kernel not known, not matching
            return;
        }
        if (!onlyThisKernel || existingKernel.kernel === onlyThisKernel) {
            this.onDidChangeSelectedNotebookKernelBindingEmitter.fire({ notebook: notebook.uri, oldKernel: undefined, newKernel: existingKernel.kernel.id });
        }
    }

    registerNotebookKernelDetectionTask(notebookType: string): Disposable {
        const all = this.kernelDetectionTasks.get(notebookType) ?? [];
        all.push(notebookType);
        this.kernelDetectionTasks.set(notebookType, all);
        this.onDidChangeKernelDetectionTasksEmitter.fire(notebookType);
        return Disposable.create(() => {
            const allTasks = this.kernelDetectionTasks.get(notebookType) ?? [];
            const taskIndex = allTasks.indexOf(notebookType);
            if (taskIndex >= 0) {
                allTasks.splice(taskIndex, 1);
                this.kernelDetectionTasks.set(notebookType, allTasks);
                this.onDidChangeKernelDetectionTasksEmitter.fire(notebookType);
            }
        });
    }

    getKernelDetectionTasks(notebook: NotebookTextModelLike): string[] {
        return this.kernelDetectionTasks.get(notebook.viewType) ?? [];
    }

    registerKernelSourceActionProvider(viewType: string, provider: KernelSourceActionProvider): Disposable {
        const providers = this.kernelSourceActionProviders.get(viewType) ?? [];
        providers.push(provider);
        this.kernelSourceActionProviders.set(viewType, providers);
        this.onDidChangeSourceActionsEmitter.fire({ viewType: viewType });

        const eventEmitterDisposable = provider.onDidChangeSourceActions?.(() => {
            this.onDidChangeSourceActionsEmitter.fire({ viewType: viewType });
        });

        return Disposable.create(() => {
            const sourceProviders = this.kernelSourceActionProviders.get(viewType) ?? [];
            const providerIndex = sourceProviders.indexOf(provider);
            if (providerIndex >= 0) {
                sourceProviders.splice(providerIndex, 1);
                this.kernelSourceActionProviders.set(viewType, sourceProviders);
            }

            eventEmitterDisposable?.dispose();
        });
    }

    async getKernelSourceActionsFromProviders(notebook: NotebookTextModelLike): Promise<NotebookKernelSourceAction[]> {
        const viewType = notebook.viewType;
        const providers = this.kernelSourceActionProviders.get(viewType) ?? [];
        const promises = providers.map(provider => provider.provideKernelSourceActions());
        const allActions = await Promise.all(promises);
        return allActions.flat();
    }
}
