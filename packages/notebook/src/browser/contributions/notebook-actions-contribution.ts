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

import { Command, CommandContribution, CommandRegistry, CompoundMenuNodeRole, MenuContribution, MenuModelRegistry, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell, codicon, CommonCommands } from '@theia/core/lib/browser';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookService } from '../service/notebook-service';
import { CellEditType, CellKind } from '../../common';
import { NotebookKernelQuickPickService } from '../service/notebook-kernel-quick-pick-service';
import { NotebookExecutionService } from '../service/notebook-execution-service';
import { NotebookEditorWidget } from '../notebook-editor-widget';

export namespace NotebookCommands {
    export const ADD_NEW_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.add-new-cell',
        iconClass: codicon('add')
    });

    export const ADD_NEW_MARKDOWN_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.add-new-markdown-cell',
        iconClass: codicon('add')
    });

    export const ADD_NEW_CODE_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.add-new-code-cell',
        iconClass: codicon('add')
    });

    export const SELECT_KERNEL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.selectKernel',
        category: 'Notebook',
        iconClass: codicon('server-environment')
    });

    export const EXECUTE_NOTEBOOK_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.execute',
        category: 'Notebook',
        iconClass: codicon('run-all')
    });

    export const CLEAR_ALL_OUTPUTS_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.clear-all-outputs',
        category: 'Notebook',
        iconClass: codicon('clear-all')
    });
}

@injectable()
export class NotebookActionsContribution implements CommandContribution, MenuContribution {

    @inject(NotebookService)
    protected notebookService: NotebookService;

    @inject(NotebookKernelQuickPickService)
    protected notebookKernelQuickPickService: NotebookKernelQuickPickService;

    @inject(NotebookExecutionService)
    protected notebookExecutionService: NotebookExecutionService;

    @inject(ApplicationShell)
    protected shell: ApplicationShell;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(NotebookCommands.ADD_NEW_CELL_COMMAND, {
            execute: (notebookModel: NotebookModel, cellKind: CellKind, index?: number) => {
                const insertIndex = index ?? (notebookModel.selectedCell ? notebookModel.cells.indexOf(notebookModel.selectedCell) : 0);
                let firstCodeCell;
                if (cellKind === CellKind.Code) {
                    firstCodeCell = notebookModel.cells.find(cell => cell.cellKind === CellKind.Code);
                }

                notebookModel.applyEdits([{
                    editType: CellEditType.Replace,
                    index: insertIndex,
                    count: 0,
                    cells: [{
                        cellKind,
                        language: firstCodeCell?.language ?? 'markdown',
                        source: '',
                        outputs: [],
                        metadata: {},
                    }]
                }], true);
            }
        });

        commands.registerCommand(NotebookCommands.ADD_NEW_MARKDOWN_CELL_COMMAND, {
            execute: (notebookModel: NotebookModel) => commands.executeCommand(NotebookCommands.ADD_NEW_CELL_COMMAND.id, notebookModel, CellKind.Markup)
        });

        commands.registerCommand(NotebookCommands.ADD_NEW_CODE_CELL_COMMAND, {
            execute: (notebookModel: NotebookModel) => commands.executeCommand(NotebookCommands.ADD_NEW_CELL_COMMAND.id, notebookModel, CellKind.Code)
        });

        commands.registerCommand(NotebookCommands.SELECT_KERNEL_COMMAND, {
            execute: (notebookModel: NotebookModel) => this.notebookKernelQuickPickService.showQuickPick(notebookModel)
        });

        commands.registerCommand(NotebookCommands.EXECUTE_NOTEBOOK_COMMAND, {
            execute: (notebookModel: NotebookModel) => this.notebookExecutionService.executeNotebookCells(notebookModel, notebookModel.cells)
        });

        commands.registerCommand(NotebookCommands.CLEAR_ALL_OUTPUTS_COMMAND, {
            execute: (notebookModel: NotebookModel) =>
                notebookModel.cells.forEach(cell => cell.spliceNotebookCellOutputs({ start: 0, deleteCount: cell.outputs.length, newOutputs: [] }))
        });

        commands.registerHandler(CommonCommands.UNDO.id, {
            isEnabled: () => this.shell.activeWidget instanceof NotebookEditorWidget,
            execute: () => (this.shell.activeWidget as NotebookEditorWidget).undo()
        });
        commands.registerHandler(CommonCommands.REDO.id, {
            isEnabled: () => this.shell.activeWidget instanceof NotebookEditorWidget,
            execute: () => (this.shell.activeWidget as NotebookEditorWidget).redo()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        // independent submenu for plugins to add commands
        menus.registerIndependentSubmenu(NotebookMenus.NOTEBOOK_MAIN_TOOLBAR, 'Notebook Main Toolbar');
        // Add Notebook Cell items
        menus.registerSubmenu(NotebookMenus.NOTEBOOK_MAIN_TOOLBAR_CELL_ADD_GROUP, 'Add Notebook Cell', { role: CompoundMenuNodeRole.Group });
        menus.registerMenuAction(NotebookMenus.NOTEBOOK_MAIN_TOOLBAR_CELL_ADD_GROUP, {
            commandId: NotebookCommands.ADD_NEW_CODE_CELL_COMMAND.id,
            label: nls.localizeByDefault('Code'),
            icon: codicon('add'),
        });
        menus.registerMenuAction(NotebookMenus.NOTEBOOK_MAIN_TOOLBAR_CELL_ADD_GROUP, {
            commandId: NotebookCommands.ADD_NEW_MARKDOWN_CELL_COMMAND.id,
            label: nls.localizeByDefault('Markdown'),
            icon: codicon('add'),
        });

        // Execution related items
        menus.registerSubmenu(NotebookMenus.NOTEBOOK_MAIN_TOOLBAR_EXECUTION_GROUP, 'Cell Execution', { role: CompoundMenuNodeRole.Group });
        menus.registerMenuAction(NotebookMenus.NOTEBOOK_MAIN_TOOLBAR_EXECUTION_GROUP, {
            commandId: NotebookCommands.EXECUTE_NOTEBOOK_COMMAND.id,
            label: nls.localizeByDefault('Run All'),
            icon: codicon('run-all'),
            order: '10'
        });
        menus.registerMenuAction(NotebookMenus.NOTEBOOK_MAIN_TOOLBAR_EXECUTION_GROUP, {
            commandId: NotebookCommands.CLEAR_ALL_OUTPUTS_COMMAND.id,
            label: nls.localizeByDefault('Clear All Outputs'),
            icon: codicon('clear-all'),
            order: '30'
        });
        // other items
    }

}

export namespace NotebookMenus {
    export const NOTEBOOK_MAIN_TOOLBAR = 'notebook/toolbar';
    export const NOTEBOOK_MAIN_TOOLBAR_CELL_ADD_GROUP = [NOTEBOOK_MAIN_TOOLBAR, 'cell-add-group'];
    export const NOTEBOOK_MAIN_TOOLBAR_EXECUTION_GROUP = [NOTEBOOK_MAIN_TOOLBAR, 'cell-execution-group'];
}
