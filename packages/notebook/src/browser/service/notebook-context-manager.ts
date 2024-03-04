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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DisposableCollection } from '@theia/core';
import { NotebookKernelService } from './notebook-kernel-service';
import { NOTEBOOK_KERNEL, NOTEBOOK_KERNEL_SELECTED, NOTEBOOK_VIEW_TYPE } from '../contributions/notebook-context-keys';
import { NotebookEditorWidget } from '../notebook-editor-widget';
import { NotebookEditorWidgetService } from './notebook-editor-widget-service';

@injectable()
export class NotebookContextManager {
    @inject(ContextKeyService) protected contextKeyService: ContextKeyService;

    @inject(NotebookKernelService)
    protected readonly notebookKernelService: NotebookKernelService;

    @inject(NotebookEditorWidgetService)
    protected readonly notebookEditorWidgetService: NotebookEditorWidgetService;

    protected readonly toDispose = new DisposableCollection();

    @postConstruct()
    init(): void {
        this.notebookEditorWidgetService.onDidChangeFocusedEditor(e => {
            this.update(e);
        });
        if (this.notebookEditorWidgetService.focusedEditor) {
            this.update(this.notebookEditorWidgetService.focusedEditor);
        }
    }

    update(widget: NotebookEditorWidget | undefined): void {
        this.toDispose.dispose();

        this.contextKeyService.setContext(NOTEBOOK_VIEW_TYPE, widget?.notebookType);

        const kernel = widget?.model ? this.notebookKernelService.getSelectedNotebookKernel(widget.model) : undefined;
        this.contextKeyService.setContext(NOTEBOOK_KERNEL_SELECTED, !!kernel);
        this.contextKeyService.setContext(NOTEBOOK_KERNEL, kernel?.id);
        this.toDispose.push(this.notebookKernelService.onDidChangeSelectedKernel(e => {
            if (e.notebook.toString() === widget?.getResourceUri()?.toString()) {
                this.contextKeyService.setContext(NOTEBOOK_KERNEL_SELECTED, !!e.newKernel);
                this.contextKeyService.setContext(NOTEBOOK_KERNEL, e.newKernel);
            }
        }));
    }
}
