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

import { CancellationToken, DisposableCollection, Emitter, Event } from '@theia/core';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { NotebookCellStatusBarItem, NotebookData, TransientOptions } from '@theia/notebook/lib/common';
import { NotebookService } from '@theia/notebook/lib/browser';
import { Disposable } from '@theia/plugin';
import { MAIN_RPC_CONTEXT, NotebooksExt, NotebooksMain } from '../../../common';
import { RPCProtocol } from '../../../common/rpc-protocol';
import { NotebookDto } from './notebook-dto';
import { UriComponents } from '@theia/core/lib/common/uri';
import { HostedPluginSupport } from '../../../hosted/browser/hosted-plugin';

export interface NotebookCellStatusBarItemList {
    items: NotebookCellStatusBarItem[];
    dispose?(): void;
}

export interface NotebookCellStatusBarItemProvider {
    viewType: string;
    onDidChangeStatusBarItems?: Event<void>;
    provideCellStatusBarItems(uri: UriComponents, index: number, token: CancellationToken): Promise<NotebookCellStatusBarItemList | undefined>;
}

export class NotebooksMainImpl implements NotebooksMain {

    private readonly disposables = new DisposableCollection();

    private readonly proxy: NotebooksExt;
    private readonly notebookSerializerRegistrations = new Map<number, Disposable>();
    private readonly notebookCellStatusBarRegistrations = new Map<number, Disposable>();

    constructor(
        rpc: RPCProtocol,
        private notebookService: NotebookService,
        plugins: HostedPluginSupport
    ) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.NOTEBOOKS_EXT);
        notebookService.onWillUseNotebookSerializer(async event => plugins.activateByNotebookSerializer(event));
        notebookService.markReady();
    }

    dispose(): void {
        this.disposables.dispose();
        for (const disposable of this.notebookSerializerRegistrations.values()) {
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

        this.notebookSerializerRegistrations.set(handle, disposables);
    }

    $unregisterNotebookSerializer(handle: number): void {
        this.notebookSerializerRegistrations.get(handle)?.dispose();
        this.notebookSerializerRegistrations.delete(handle);
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
            async provideCellStatusBarItems(uri: UriComponents, index: number, token: CancellationToken): Promise<NotebookCellStatusBarItemList | undefined> {
                const result = await that.proxy.$provideNotebookCellStatusBarItems(handle, uri, index, token);
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

        // const disposable = this.cellStatusBarService.registerCellStatusBarItemProvider(provider);
        // this.notebookCellStatusBarRegistrations.set(handle, disposable);
    }

    async $unregisterNotebookCellStatusBarItemProvider(eventHandle: number | undefined): Promise<void> {
        if (eventHandle) {
            const entry = this.notebookCellStatusBarRegistrations.get(eventHandle);
            if (entry) {
                this.notebookCellStatusBarRegistrations.get(eventHandle)?.dispose();
                this.notebookCellStatusBarRegistrations.delete(eventHandle);
            }
        }
    }
}

