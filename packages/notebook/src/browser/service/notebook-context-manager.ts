// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ContextKeyChangeEvent, ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DisposableCollection, Emitter } from '@theia/core';
import { NotebookKernelService } from './notebook-kernel-service';
import { NOTEBOOK_KERNEL, NOTEBOOK_KERNEL_SELECTED, NOTEBOOK_VIEW_TYPE } from '../contributions/notebook-context-keys';
import { NotebookEditorWidget } from '../notebook-editor-widget';

@injectable()
export class NotebookContextManager {
    @inject(ContextKeyService) protected contextKeyService: ContextKeyService;

    @inject(NotebookKernelService)
    protected readonly notebookKernelService: NotebookKernelService;

    protected readonly toDispose = new DisposableCollection();

    protected readonly onDidChangeContextEmitter = new Emitter<ContextKeyChangeEvent>();
    readonly onDidChangeContext = this.onDidChangeContextEmitter.event;

    init(widget: NotebookEditorWidget): void {
        this.toDispose.push(this.contextKeyService.onDidChange(e => this.onDidChangeContextEmitter.fire(e)));

        const scopedStore = this.contextKeyService.createScoped(widget.node);

        this.toDispose.dispose();

        scopedStore.setContext(NOTEBOOK_VIEW_TYPE, widget?.notebookType);

        const kernel = widget?.model ? this.notebookKernelService.getSelectedNotebookKernel(widget.model) : undefined;
        scopedStore.setContext(NOTEBOOK_KERNEL_SELECTED, !!kernel);
        scopedStore.setContext(NOTEBOOK_KERNEL, kernel?.id);
        this.toDispose.push(this.notebookKernelService.onDidChangeSelectedKernel(e => {
            if (e.notebook.toString() === widget?.getResourceUri()?.toString()) {
                scopedStore.setContext(NOTEBOOK_KERNEL_SELECTED, !!e.newKernel);
                scopedStore.setContext(NOTEBOOK_KERNEL, e.newKernel);
                this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_KERNEL_SELECTED, NOTEBOOK_KERNEL]));
            }
        }));
        this.onDidChangeContextEmitter.fire(this.createContextKeyChangedEvent([NOTEBOOK_VIEW_TYPE, NOTEBOOK_KERNEL_SELECTED, NOTEBOOK_KERNEL]));
    }

    createContextKeyChangedEvent(affectedKeys: string[]): ContextKeyChangeEvent {
        return { affects: keys => affectedKeys.some(key => keys.has(key)) };
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}
