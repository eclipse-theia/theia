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
import { codicon } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_TYPE, NotebookContextKeys, NOTEBOOK_CELL_EXECUTING } from './notebook-context-keys';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { NotebookExecutionService } from '../service/notebook-execution-service';
import { NotebookCellOutputModel } from '../view-model/notebook-cell-output-model';
import { CellEditType } from '../../common';

export namespace NotebookCellCommands {
    /** Parameters: notebookModel: NotebookModel | undefined, cell: NotebookCellModel */
    export const EDIT_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.edit',
        iconClass: codicon('edit')
    });
    /** Parameters: notebookModel: NotebookModel | undefined, cell: NotebookCellModel */
    export const STOP_EDIT_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.stop-edit',
        iconClass: codicon('check')
    });
    /** Parameters: notebookModel: NotebookModel, cell: NotebookCellModel */
    export const DELETE_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.delete',
        iconClass: codicon('trash')
    });
    /** Parameters: notebookModel: NotebookModel, cell: NotebookCellModel */
    export const SPLIT_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.split-cell',
        iconClass: codicon('split-vertical'),
    });
    /** Parameters: notebookModel: NotebookModel, cell: NotebookCellModel */
    export const EXECUTE_SINGLE_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.execute-cell',
        iconClass: codicon('play'),
    });
    /** Parameters: notebookModel: NotebookModel, cell: NotebookCellModel */
    export const STOP_CELL_EXECUTION_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.stop-cell-execution',
        iconClass: codicon('stop'),
    });
    /** Parameters: notebookModel: NotebookModel | undefined, cell: NotebookCellModel */
    export const CLEAR_OUTPUTS_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.clear-outputs',
        label: 'Clear Cell Outputs',
    });
    /** Parameters: notebookModel: NotebookModel | undefined, cell: NotebookCellModel | undefined, output: NotebookCellOutputModel */
    export const CHANGE_OUTPUT_PRESENTATION_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.change-presentation',
        label: 'Change Presentation',
    });
}

@injectable()
export class NotebookCellActionContribution implements MenuContribution, CommandContribution {

    @inject(ContextKeyService)
    protected contextKeyService: ContextKeyService;

    @inject(NotebookExecutionService)
    protected notebookExecutionService: NotebookExecutionService;

    @postConstruct()
    protected init(): void {
        NotebookContextKeys.initNotebookContextKeys(this.contextKeyService);
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(NotebookCellActionContribution.ACTION_MENU, {
            commandId: NotebookCellCommands.EDIT_COMMAND.id,
            icon: NotebookCellCommands.EDIT_COMMAND.iconClass,
            when: `${NOTEBOOK_CELL_TYPE} == 'markdown' && !${NOTEBOOK_CELL_MARKDOWN_EDIT_MODE}`,
            label: nls.localizeByDefault('Edit Cell'),
            order: '10'
        });
        menus.registerMenuAction(NotebookCellActionContribution.ACTION_MENU, {
            commandId: NotebookCellCommands.STOP_EDIT_COMMAND.id,
            icon: NotebookCellCommands.STOP_EDIT_COMMAND.iconClass,
            when: `${NOTEBOOK_CELL_TYPE} == 'markdown' && ${NOTEBOOK_CELL_MARKDOWN_EDIT_MODE}`,
            label: nls.localizeByDefault('Stop Editing Cell'),
            order: '10'
        });
        menus.registerMenuAction(NotebookCellActionContribution.ACTION_MENU, {
            commandId: NotebookCellCommands.EXECUTE_SINGLE_CELL_COMMAND.id,
            icon: NotebookCellCommands.EXECUTE_SINGLE_CELL_COMMAND.iconClass,
            when: `${NOTEBOOK_CELL_TYPE} == 'code'`,
            label: nls.localizeByDefault('Execute Cell'),
            order: '10'
        });

        menus.registerMenuAction(NotebookCellActionContribution.ACTION_MENU, {
            commandId: NotebookCellCommands.SPLIT_CELL_COMMAND.id,
            icon: NotebookCellCommands.SPLIT_CELL_COMMAND.iconClass,
            label: nls.localizeByDefault('Split Cell'),
            order: '20'
        });
        menus.registerMenuAction(NotebookCellActionContribution.ACTION_MENU, {
            commandId: NotebookCellCommands.DELETE_COMMAND.id,
            icon: NotebookCellCommands.DELETE_COMMAND.iconClass,
            label: nls.localizeByDefault('Delete Cell'),
            order: '999'
        });

        menus.registerSubmenu(
            NotebookCellActionContribution.ADDITIONAL_ACTION_MENU,
            nls.localizeByDefault('More'),
            {
                icon: codicon('ellipsis'),
                role: CompoundMenuNodeRole.Submenu,
                order: '30'
            }
        );

        menus.registerIndependentSubmenu(NotebookCellActionContribution.CONTRIBUTED_CELL_ACTION_MENU, '', { role: CompoundMenuNodeRole.Flat });
        // since contributions are adding to an independent submenu we have to manually add it to the more submenu
        menus.getMenu(NotebookCellActionContribution.ADDITIONAL_ACTION_MENU).addNode(menus.getMenuNode(NotebookCellActionContribution.CONTRIBUTED_CELL_ACTION_MENU));

        // code cell sidebar menu
        menus.registerMenuAction(NotebookCellActionContribution.CODE_CELL_SIDEBAR_MENU, {
            commandId: NotebookCellCommands.EXECUTE_SINGLE_CELL_COMMAND.id,
            icon: NotebookCellCommands.EXECUTE_SINGLE_CELL_COMMAND.iconClass,
            label: nls.localizeByDefault('Execute Cell'),
            when: `!${NOTEBOOK_CELL_EXECUTING}`
        });
        menus.registerMenuAction(NotebookCellActionContribution.CODE_CELL_SIDEBAR_MENU, {
            commandId: NotebookCellCommands.STOP_CELL_EXECUTION_COMMAND.id,
            icon: NotebookCellCommands.STOP_CELL_EXECUTION_COMMAND.iconClass,
            label: nls.localizeByDefault('Stop Cell Execution'),
            when: NOTEBOOK_CELL_EXECUTING
        });

        // Notebook Cell extra execution options
        menus.registerIndependentSubmenu(NotebookCellActionContribution.CONTRIBUTED_CELL_EXECUTION_MENU,
            nls.localizeByDefault('More...'),
            { role: CompoundMenuNodeRole.Flat, icon: codicon('chevron-down') });
        menus.getMenu(NotebookCellActionContribution.CODE_CELL_SIDEBAR_MENU).addNode(menus.getMenuNode(NotebookCellActionContribution.CONTRIBUTED_CELL_EXECUTION_MENU));

        // code cell output sidebar menu
        menus.registerSubmenu(
            NotebookCellActionContribution.ADDITIONAL_OUTPUT_SIDEBAR_MENU,
            nls.localizeByDefault('More'),
            {
                icon: codicon('ellipsis'),
                role: CompoundMenuNodeRole.Submenu
            });
        menus.registerMenuAction(NotebookCellActionContribution.ADDITIONAL_OUTPUT_SIDEBAR_MENU, {
            commandId: NotebookCellCommands.CLEAR_OUTPUTS_COMMAND.id,
            label: nls.localizeByDefault('Clear Cell Outputs'),
        });
        menus.registerMenuAction(NotebookCellActionContribution.ADDITIONAL_OUTPUT_SIDEBAR_MENU, {
            commandId: NotebookCellCommands.CHANGE_OUTPUT_PRESENTATION_COMMAND.id,
            label: nls.localizeByDefault('Change Presentation'),
        });

    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(NotebookCellCommands.EDIT_COMMAND, { execute: (_, cell: NotebookCellModel) => cell.requestEdit() });
        commands.registerCommand(NotebookCellCommands.STOP_EDIT_COMMAND, { execute: (_, cell: NotebookCellModel) => cell.requestStopEdit() });
        commands.registerCommand(NotebookCellCommands.DELETE_COMMAND, {
            execute: (notebookModel: NotebookModel, cell: NotebookCellModel) => notebookModel.applyEdits([{
                editType: CellEditType.Replace,
                index: notebookModel.cells.indexOf(cell),
                count: 1,
                cells: []
            }], true)
        });
        commands.registerCommand(NotebookCellCommands.SPLIT_CELL_COMMAND);

        commands.registerCommand(NotebookCellCommands.EXECUTE_SINGLE_CELL_COMMAND, {
            execute: (notebookModel: NotebookModel, cell: NotebookCellModel) => this.notebookExecutionService.executeNotebookCells(notebookModel, [cell])
        });
        commands.registerCommand(NotebookCellCommands.STOP_CELL_EXECUTION_COMMAND, {
            execute: (notebookModel: NotebookModel, cell: NotebookCellModel) => this.notebookExecutionService.cancelNotebookCells(notebookModel, [cell])
        });
        commands.registerCommand(NotebookCellCommands.CLEAR_OUTPUTS_COMMAND, {
            execute: (_, cell: NotebookCellModel) => cell.spliceNotebookCellOutputs({ start: 0, deleteCount: cell.outputs.length, newOutputs: [] })
        });
        commands.registerCommand(NotebookCellCommands.CHANGE_OUTPUT_PRESENTATION_COMMAND, {
            execute: (_, __, output: NotebookCellOutputModel) => output.requestOutputPresentationUpdate()
        });
    }
}

export namespace NotebookCellActionContribution {
    export const ACTION_MENU = ['notebook-cell-actions-menu'];
    export const ADDITIONAL_ACTION_MENU = [...ACTION_MENU, 'more'];
    export const CONTRIBUTED_CELL_ACTION_MENU = 'notebook/cell/title';
    export const CONTRIBUTED_CELL_EXECUTION_MENU = 'notebook/cell/execute';
    export const CODE_CELL_SIDEBAR_MENU = ['code-cell-sidebar-menu'];
    export const OUTPUT_SIDEBAR_MENU = ['code-cell-output-sidebar-menu'];
    export const ADDITIONAL_OUTPUT_SIDEBAR_MENU = [...OUTPUT_SIDEBAR_MENU, 'more'];

}
