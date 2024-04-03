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

import { Command, CommandContribution, CommandHandler, CommandRegistry, CompoundMenuNodeRole, MenuContribution, MenuModelRegistry, nls } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell, codicon, CommonCommands, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookService } from '../service/notebook-service';
import { CellEditType, CellKind, NotebookCommand } from '../../common';
import { NotebookKernelQuickPickService } from '../service/notebook-kernel-quick-pick-service';
import { NotebookExecutionService } from '../service/notebook-execution-service';
import { NotebookEditorWidget } from '../notebook-editor-widget';
import { NotebookEditorWidgetService } from '../service/notebook-editor-widget-service';
import { NOTEBOOK_CELL_FOCUSED, NOTEBOOK_EDITOR_FOCUSED } from './notebook-context-keys';
import { OutlineViewContribution } from '@theia/outline-view/lib/browser/outline-view-contribution';

export namespace NotebookCommands {
    export const ADD_NEW_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.add-new-cell',
        iconClass: codicon('add')
    });

    export const ADD_NEW_MARKDOWN_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.add-new-markdown-cell',
        iconClass: codicon('add'),
        tooltip: nls.localizeByDefault('Add Markdown Cell')
    } as NotebookCommand);

    export const ADD_NEW_CODE_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.add-new-code-cell',
        iconClass: codicon('add'),
        tooltip: nls.localizeByDefault('Add Code Cell')
    } as NotebookCommand);

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

    export const CHANGE_SELECTED_CELL = Command.toDefaultLocalizedCommand({
        id: 'notebook.change-selected-cell',
        category: 'Notebook',
    });
}

export enum CellChangeDirection {
    Up = 'up',
    Down = 'down'
}

@injectable()
export class NotebookActionsContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(NotebookService)
    protected notebookService: NotebookService;

    @inject(NotebookKernelQuickPickService)
    protected notebookKernelQuickPickService: NotebookKernelQuickPickService;

    @inject(NotebookExecutionService)
    protected notebookExecutionService: NotebookExecutionService;

    @inject(ApplicationShell)
    protected shell: ApplicationShell;

    @inject(NotebookEditorWidgetService)
    protected notebookEditorWidgetService: NotebookEditorWidgetService;

    @inject(OutlineViewContribution)
    protected outlineViewContribution: OutlineViewContribution;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(NotebookCommands.ADD_NEW_CELL_COMMAND, {
            execute: (notebookModel: NotebookModel, cellKind: CellKind = CellKind.Markup, index?: number | 'above' | 'below') => {
                notebookModel = notebookModel ?? this.notebookEditorWidgetService.focusedEditor?.model;

                let insertIndex: number = 0;
                if (index && index >= 0) {
                    insertIndex = index as number;
                } else if (notebookModel.selectedCell && typeof index === 'string') {
                    // if index is -1 insert below otherwise at the index of the selected cell which is above the selected.
                    insertIndex = notebookModel.cells.indexOf(notebookModel.selectedCell) + (index === 'below' ? 1 : 0);
                }

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

        commands.registerCommand(NotebookCommands.ADD_NEW_MARKDOWN_CELL_COMMAND, this.editableCommandHandler(
            notebookModel => commands.executeCommand(NotebookCommands.ADD_NEW_CELL_COMMAND.id, notebookModel, CellKind.Markup, 'below')
        ));

        commands.registerCommand(NotebookCommands.ADD_NEW_CODE_CELL_COMMAND, this.editableCommandHandler(
            notebookModel => commands.executeCommand(NotebookCommands.ADD_NEW_CELL_COMMAND.id, notebookModel, CellKind.Code, 'below')
        ));

        commands.registerCommand(NotebookCommands.SELECT_KERNEL_COMMAND, this.editableCommandHandler(
            notebookModel => this.notebookKernelQuickPickService.showQuickPick(notebookModel)
        ));

        commands.registerCommand(NotebookCommands.EXECUTE_NOTEBOOK_COMMAND, this.editableCommandHandler(
            notebookModel => this.notebookExecutionService.executeNotebookCells(notebookModel, notebookModel.cells)
        ));

        commands.registerCommand(NotebookCommands.CLEAR_ALL_OUTPUTS_COMMAND, this.editableCommandHandler(
            notebookModel => notebookModel.cells.forEach(cell => cell.spliceNotebookCellOutputs({ start: 0, deleteCount: cell.outputs.length, newOutputs: [] }))
        ));

        commands.registerCommand(NotebookCommands.CHANGE_SELECTED_CELL,
            {
                execute: (change: number | CellChangeDirection) => {
                    const model = this.notebookEditorWidgetService.focusedEditor?.model;
                    if (model && typeof change === 'number') {
                        model.setSelectedCell(model.cells[change]);
                    } else if (model && model.selectedCell) {
                        const currentIndex = model.cells.indexOf(model.selectedCell);
                        if (change === CellChangeDirection.Up && currentIndex > 0) {
                            model.setSelectedCell(model.cells[currentIndex - 1]);
                        } else if (change === CellChangeDirection.Down && currentIndex < model.cells.length - 1) {
                            model.setSelectedCell(model.cells[currentIndex + 1]);
                        }
                    }
                }
            }
        );

        commands.registerHandler(CommonCommands.UNDO.id, {
            isEnabled: () => {
                const widget = this.shell.activeWidget;
                return widget instanceof NotebookEditorWidget && !Boolean(widget.model?.readOnly);
            },
            execute: () => (this.shell.activeWidget as NotebookEditorWidget).undo()
        });
        commands.registerHandler(CommonCommands.REDO.id, {
            isEnabled: () => {
                const widget = this.shell.activeWidget;
                return widget instanceof NotebookEditorWidget && !Boolean(widget.model?.readOnly);
            },
            execute: () => (this.shell.activeWidget as NotebookEditorWidget).redo()
        });

        // required by Jupyter for the show table of contents action
        commands.registerCommand({ id: 'outline.focus' }, {
            execute: () => this.outlineViewContribution.openView({ activate: true })
        });

    }

    protected editableCommandHandler(execute: (notebookModel: NotebookModel) => void): CommandHandler {
        return {
            isEnabled: (notebookModel: NotebookModel) => !Boolean(notebookModel?.readOnly),
            isVisible: (notebookModel: NotebookModel) => !Boolean(notebookModel?.readOnly),
            execute: (notebookModel: NotebookModel) => {
                execute(notebookModel);
            }
        };
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

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybindings(
            {
                command: NotebookCommands.CHANGE_SELECTED_CELL.id,
                keybinding: 'up',
                args: CellChangeDirection.Up,
                when: `!editorTextFocus && ${NOTEBOOK_EDITOR_FOCUSED} && ${NOTEBOOK_CELL_FOCUSED}`
            },
            {
                command: NotebookCommands.CHANGE_SELECTED_CELL.id,
                keybinding: 'down',
                args: CellChangeDirection.Down,
                when: `!editorTextFocus && ${NOTEBOOK_EDITOR_FOCUSED} && ${NOTEBOOK_CELL_FOCUSED}`
            },
        );
    }

}

export namespace NotebookMenus {
    export const NOTEBOOK_MAIN_TOOLBAR = 'notebook/toolbar';
    export const NOTEBOOK_MAIN_TOOLBAR_CELL_ADD_GROUP = [NOTEBOOK_MAIN_TOOLBAR, 'cell-add-group'];
    export const NOTEBOOK_MAIN_TOOLBAR_EXECUTION_GROUP = [NOTEBOOK_MAIN_TOOLBAR, 'cell-execution-group'];
}
