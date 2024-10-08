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

import { CancellationToken, DisposableCollection, Emitter, URI } from '@theia/core';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { CellEditType, NotebookCellModelResource, NotebookData, NotebookModelResource, TransientOptions } from '@theia/notebook/lib/common';
import { NotebookService, NotebookWorkspaceEdit } from '@theia/notebook/lib/browser';
import { Disposable } from '@theia/plugin';
import { CommandRegistryMain, MAIN_RPC_CONTEXT, NotebooksExt, NotebooksMain, WorkspaceEditDto, WorkspaceNotebookCellEditDto } from '../../../common';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { NotebookDto } from './notebook-dto';
import { HostedPluginSupport } from '../../../hosted/browser/hosted-plugin';
import { NotebookModel } from '@theia/notebook/lib/browser/view-model/notebook-model';
import { NotebookCellModel } from '@theia/notebook/lib/browser/view-model/notebook-cell-model';
import { interfaces } from '@theia/core/shared/inversify';
import {
    NotebookCellStatusBarItemProvider,
    NotebookCellStatusBarItemList,
    NotebookCellStatusBarService
} from '@theia/notebook/lib/browser/service/notebook-cell-status-bar-service';

export class NotebooksMainImpl implements NotebooksMain {

    protected readonly disposables = new DisposableCollection();

    protected notebookService: NotebookService;
    protected cellStatusBarService: NotebookCellStatusBarService;

    protected readonly proxy: NotebooksExt;
    protected readonly notebookSerializer = new Map<number, Disposable>();
    protected readonly notebookCellStatusBarRegistrations = new Map<number, Disposable>();

    constructor(
        rpc: RPCProtocol,
        container: interfaces.Container,
        commands: CommandRegistryMain
    ) {
        this.notebookService = container.get(NotebookService);
        this.cellStatusBarService = container.get(NotebookCellStatusBarService);
        const plugins = container.get(HostedPluginSupport);

        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.NOTEBOOKS_EXT);
        this.notebookService.onWillUseNotebookSerializer(event => plugins.activateByNotebookSerializer(event));
        this.notebookService.markReady();
        commands.registerArgumentProcessor({
            processArgument: arg => {
                if (arg instanceof NotebookModel) {
                    return NotebookModelResource.create(arg.uri);
                } else if (arg instanceof NotebookCellModel) {
                    return NotebookCellModelResource.create(arg.uri);
                }
                return arg;
            }
        });
    }

    dispose(): void {
        this.disposables.dispose();
        for (const disposable of this.notebookSerializer.values()) {
            disposable.dispose();
        }
    }

    $registerNotebookSerializer(handle: number, viewType: string, options: TransientOptions): void {
        const disposables = new DisposableCollection();

        disposables.push(this.notebookService.registerNotebookSerializer(viewType, {
            options,
            toNotebook: async (data: BinaryBuffer): Promise<NotebookData> => {
                const dto = await this.proxy.$dataToNotebook(handle, data, CancellationToken.None);
                return NotebookDto.fromNotebookDataDto(dto);
            },
            fromNotebook: (data: NotebookData): Promise<BinaryBuffer> =>
                this.proxy.$notebookToData(handle, NotebookDto.toNotebookDataDto(data), CancellationToken.None)

        }));

        this.notebookSerializer.set(handle, disposables);
    }

    $unregisterNotebookSerializer(handle: number): void {
        this.notebookSerializer.get(handle)?.dispose();
        this.notebookSerializer.delete(handle);
    }

    $emitCellStatusBarEvent(eventHandle: number): void {
        const emitter = this.notebookCellStatusBarRegistrations.get(eventHandle);
        if (emitter instanceof Emitter) {
            emitter.fire(undefined);
        }
    }

    async $registerNotebookCellStatusBarItemProvider(handle: number, eventHandle: number | undefined, viewType: string): Promise<void> {
        const that = this;
        const provider: NotebookCellStatusBarItemProvider = {
            async provideCellStatusBarItems(notebookUri: URI, index: number, token: CancellationToken): Promise<NotebookCellStatusBarItemList | undefined> {
                const result = await that.proxy.$provideNotebookCellStatusBarItems(handle, notebookUri.toComponents(), index, token);
                return {
                    items: result?.items ?? [],
                    dispose(): void {
                        if (result) {
                            that.proxy.$releaseNotebookCellStatusBarItems(result.cacheId);
                        }
                    }
                };
            },
            viewType
        };

        if (typeof eventHandle === 'number') {
            const emitter = new Emitter<void>();
            this.notebookCellStatusBarRegistrations.set(eventHandle, emitter);
            provider.onDidChangeStatusBarItems = emitter.event;
        }

        const disposable = this.cellStatusBarService.registerCellStatusBarItemProvider(provider);
        this.notebookCellStatusBarRegistrations.set(handle, disposable);
    }

    async $unregisterNotebookCellStatusBarItemProvider(handle: number, eventHandle: number | undefined): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const unregisterThing = (statusBarHandle: number) => {
            const entry = this.notebookCellStatusBarRegistrations.get(statusBarHandle);
            if (entry) {
                this.notebookCellStatusBarRegistrations.get(statusBarHandle)?.dispose();
                this.notebookCellStatusBarRegistrations.delete(statusBarHandle);
            }
        };
        unregisterThing(handle);
        if (typeof eventHandle === 'number') {
            unregisterThing(eventHandle);
        }
    }
}

export function toNotebookWorspaceEdit(dto: WorkspaceEditDto): NotebookWorkspaceEdit {
    return {
        edits: dto.edits.map((edit: WorkspaceNotebookCellEditDto) => ({
            resource: URI.fromComponents(edit.resource),
            edit: edit.cellEdit.editType === CellEditType.Replace ? {
                ...edit.cellEdit,
                cells: edit.cellEdit.cells.map(cell => NotebookDto.fromNotebookCellDataDto(cell))
            } : edit.cellEdit
        }))
    };
}
