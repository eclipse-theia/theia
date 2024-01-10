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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { StorageService } from '@theia/core/lib/browser';
import { NotebookKernel, NotebookTextModelLike, NotebookKernelService } from './notebook-kernel-service';
import { CommandService, Disposable } from '@theia/core';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookCommands } from '../contributions/notebook-actions-contribution';

interface KernelsList {
    [viewType: string]: string[];
}

interface MostRecentKernelsResult {
    selected?: NotebookKernel,
    all: NotebookKernel[]
}

const MAX_KERNELS_IN_HISTORY = 5;

@injectable()
export class NotebookKernelHistoryService implements Disposable {

    @inject(StorageService)
    protected storageService: StorageService;

    @inject(NotebookKernelService)
    protected notebookKernelService: NotebookKernelService;

    @inject(CommandService)
    protected commandService: CommandService;

    protected static STORAGE_KEY = 'notebook.kernelHistory';
    protected mostRecentKernelsMap: KernelsList = {};

    @postConstruct()
    protected init(): void {
        this.loadState();
    }

    getKernels(notebook: NotebookTextModelLike): MostRecentKernelsResult {
        const allAvailableKernels = this.notebookKernelService.getMatchingKernel(notebook);
        const allKernels = allAvailableKernels.all;
        const selectedKernel = allAvailableKernels.selected;
        // We will suggest the only kernel
        const suggested = allAvailableKernels.all.length === 1 ? allAvailableKernels.all[0] : undefined;
        const mostRecentKernelIds = this.mostRecentKernelsMap[notebook.viewType] ? this.mostRecentKernelsMap[notebook.viewType].map(kernel => kernel[1]) : [];
        const all = mostRecentKernelIds.map(kernelId => allKernels.find(kernel => kernel.id === kernelId)).filter(kernel => !!kernel) as NotebookKernel[];

        return {
            selected: selectedKernel ?? suggested,
            all
        };
    }

    async resolveSelectedKernel(notebook: NotebookModel): Promise<NotebookKernel | undefined> {
        const alreadySelected = this.getKernels(notebook);

        if (alreadySelected.selected) {
            return alreadySelected.selected;
        }

        await this.commandService.executeCommand(NotebookCommands.SELECT_KERNEL_COMMAND.id, notebook);
        const { selected } = this.getKernels(notebook);
        return selected;
    }

    addMostRecentKernel(kernel: NotebookKernel): void {
        const viewType = kernel.viewType;
        const recentKernels = this.mostRecentKernelsMap[viewType] ?? [kernel.id];

        if (recentKernels.length > MAX_KERNELS_IN_HISTORY) {
            recentKernels.splice(MAX_KERNELS_IN_HISTORY);
        }

        this.mostRecentKernelsMap[viewType] = recentKernels;
        this.saveState();
    }

    protected saveState(): void {
        let notEmpty = false;
        for (const kernels of Object.values(this.mostRecentKernelsMap)) {
            notEmpty = notEmpty || Object.entries(kernels).length > 0;
        }

        this.storageService.setData(NotebookKernelHistoryService.STORAGE_KEY, notEmpty ? this.mostRecentKernelsMap : undefined);
    }

    protected async loadState(): Promise<void> {
        const kernelMap = await this.storageService.getData(NotebookKernelHistoryService.STORAGE_KEY);
        if (kernelMap) {
            this.mostRecentKernelsMap = kernelMap as KernelsList;
        } else {
            this.mostRecentKernelsMap = {};
        }
    }

    clear(): void {
        this.mostRecentKernelsMap = {};
        this.saveState();
    }

    dispose(): void {

    }
}
