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

import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { NotebookEditorWidgetService } from '../service/notebook-editor-widget-service';
import { CellOutput, CellUri } from '../../common';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { EditorManager } from '@theia/editor/lib/browser';

export namespace NotebookOutputCommands {
    export const ENABLE_SCROLLING = Command.toDefaultLocalizedCommand({
        id: 'cellOutput.enableScrolling',
    });

    export const OPEN_LARGE_OUTPUT = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.openLargeOutput',
        label: 'Open Large Output'
    });
}

@injectable()
export class NotebookOutputActionContribution implements CommandContribution {

    @inject(NotebookEditorWidgetService)
    protected readonly notebookEditorService: NotebookEditorWidgetService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(NotebookOutputCommands.ENABLE_SCROLLING, {
            execute: outputId => {
                const [cell, output] = this.findOutputAndCell(outputId) ?? [];
                if (cell && output?.metadata) {
                    output.metadata['scrollable'] = true;
                    cell.restartOutputRenderer(output.outputId);
                }
            }
        });

        commands.registerCommand(NotebookOutputCommands.OPEN_LARGE_OUTPUT, {
            execute: outputId => {
                const [cell, output] = this.findOutputAndCell(outputId) ?? [];
                if (cell && output) {
                    this.editorManager.open(CellUri.generateCellOutputUri(CellUri.parse(cell.uri)!.notebook, output.outputId));
                }
            }
        });
    }

    protected findOutputAndCell(output: string): [NotebookCellModel, CellOutput] | undefined {
        const model = this.notebookEditorService.focusedEditor?.model;
        if (!model) {
            return undefined;
        }

        const outputId = output.slice(0, output.lastIndexOf('-'));

        for (const cell of model.cells) {
            for (const outputModel of cell.outputs) {
                if (outputModel.outputId === outputId) {
                    return [cell, outputModel];
                }
            }
        }
    }

}
