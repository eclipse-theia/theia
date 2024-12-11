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

import { injectable } from '@theia/core/shared/inversify';
import { StatusBar, StatusBarAlignment, Widget, WidgetStatusBarContribution } from '@theia/core/lib/browser';
import { Disposable } from '@theia/core/lib/common';
import { NotebookEditorWidget } from '../notebook-editor-widget';
import { nls } from '@theia/core';
import { NotebookCommands } from './notebook-actions-contribution';

export const NOTEBOOK_CELL_SELECTION_STATUS_BAR_ID = 'notebook-cell-selection-position';

@injectable()
export class NotebookStatusBarContribution implements WidgetStatusBarContribution<NotebookEditorWidget> {

    protected onDeactivate: Disposable | undefined;

    canHandle(widget: Widget): widget is NotebookEditorWidget {
        return widget instanceof NotebookEditorWidget;
    }

    activate(statusBar: StatusBar, widget: NotebookEditorWidget): void {
        widget.ready.then(model => {
            this.onDeactivate = model.onDidChangeSelectedCell(() => {
                this.updateStatusbar(statusBar, widget);
            });
        });
        this.updateStatusbar(statusBar, widget);
    }

    deactivate(statusBar: StatusBar): void {
        this.onDeactivate?.dispose();
        this.updateStatusbar(statusBar);
    }

    protected async updateStatusbar(statusBar: StatusBar, editor?: NotebookEditorWidget): Promise<void> {
        const model = await editor?.ready;
        if (!model || model.cells.length === 0 || !model.selectedCell) {
            statusBar.removeElement(NOTEBOOK_CELL_SELECTION_STATUS_BAR_ID);
            return;
        }

        const selectedCellIndex = model.cells.indexOf(model.selectedCell) + 1;

        statusBar.setElement(NOTEBOOK_CELL_SELECTION_STATUS_BAR_ID, {
            text: nls.localizeByDefault('Cell {0} of {1}', selectedCellIndex, model.cells.length),
            alignment: StatusBarAlignment.RIGHT,
            priority: 100,
            command: NotebookCommands.CENTER_ACTIVE_CELL.id,
            arguments: [editor]
        });
    }
}
