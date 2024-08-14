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
import { FrontendApplicationContribution, StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { Disposable } from '@theia/core/lib/common';
import { NotebookEditorWidgetService } from '../service/notebook-editor-widget-service';
import { NotebookEditorWidget } from '../notebook-editor-widget';
import { nls } from '@theia/core';
import { NotebookCommands } from './notebook-actions-contribution';

export const NOTEBOOK_CELL_SELECTION_STATUS_BAR_ID = 'notebook-cell-selection-position';

@injectable()
export class NotebookStatusBarContribution implements FrontendApplicationContribution {

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(NotebookEditorWidgetService) protected readonly editorWidgetService: NotebookEditorWidgetService;

    protected currentCellSelectionListener: Disposable | undefined;
    protected lastFocusedEditor: NotebookEditorWidget | undefined;

    onStart(): void {
        this.editorWidgetService.onDidChangeFocusedEditor(editor => {
            this.currentCellSelectionListener?.dispose();
            this.currentCellSelectionListener = editor?.model?.onDidChangeSelectedCell(() =>
                this.updateStatusbar(editor)
            );
            editor?.onDidDispose(() => {
                this.lastFocusedEditor = undefined;
                this.updateStatusbar();
            });
            this.updateStatusbar(editor);
            this.lastFocusedEditor = editor;
        });
        if (this.editorWidgetService.focusedEditor) {
            this.updateStatusbar();
        }
    }

    protected async updateStatusbar(editor?: NotebookEditorWidget): Promise<void> {
        if (!editor && !this.lastFocusedEditor?.isVisible) {
            this.statusBar.removeElement(NOTEBOOK_CELL_SELECTION_STATUS_BAR_ID);
            return;
        }

        await editor?.ready;
        if (!editor?.model) {
            return;
        }

        const selectedCellIndex = editor.model.selectedCell ? editor.model.cells.indexOf(editor.model.selectedCell) + 1 : '';

        this.statusBar.setElement(NOTEBOOK_CELL_SELECTION_STATUS_BAR_ID, {
            text: nls.localizeByDefault('Cell {0} of {1}', selectedCellIndex, editor.model.cells.length),
            alignment: StatusBarAlignment.RIGHT,
            priority: 100,
            command: NotebookCommands.CENTER_ACTIVE_CELL.id,
            arguments: [editor]
        });

    }

}
