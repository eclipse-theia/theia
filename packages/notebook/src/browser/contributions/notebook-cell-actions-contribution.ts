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

import { Command, CommandContribution, CommandRegistry, CompoundMenuNodeRole, MenuContribution, MenuModelRegistry } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_TYPE, NotebookContextKeys } from './notebook-context-keys';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';

export namespace NotebookCellCommands {
    export const EDIT_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.edit',
        iconClass: codicon('edit')
    });
    export const STOP_EDIT_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.stop-edit',
        iconClass: codicon('check')
    });
    export const DELETE_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.delete',
        iconClass: codicon('trash')
    });
    export const SPLIT_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.split-cell',
        iconClass: codicon('split-vertical'),
    });
}

@injectable()
export class NotebookCellActionContribution implements MenuContribution, CommandContribution {

    @inject(ContextKeyService)
    protected contextKeyService: ContextKeyService;

    protected runDeleteAction(notebookModel: NotebookModel, cell: NotebookCellModel): void {
        notebookModel.removeCell(notebookModel.cells.indexOf(cell), 1);
    }

    protected requestCellEdit(notebookModel: NotebookModel, cell: NotebookCellModel): void {
        cell.requestEdit();
    }

    @postConstruct()
    protected init(): void {
        NotebookContextKeys.initNotebookContextKeys(this.contextKeyService);
    }

    registerMenus(menus: MenuModelRegistry): void {
        const menuId = 'notebook-cell-acions-menu';
        menus.registerMenuAction([menuId], {
            commandId: NotebookCellCommands.EDIT_COMMAND.id,
            icon: NotebookCellCommands.EDIT_COMMAND.iconClass,
            when: `${NOTEBOOK_CELL_TYPE} == 'markdown' && !${NOTEBOOK_CELL_MARKDOWN_EDIT_MODE}`,
            order: '10'
        });
        menus.registerMenuAction([menuId], {
            commandId: NotebookCellCommands.STOP_EDIT_COMMAND.id,
            icon: NotebookCellCommands.STOP_EDIT_COMMAND.iconClass,
            when: `${NOTEBOOK_CELL_TYPE} == 'markdown' && ${NOTEBOOK_CELL_MARKDOWN_EDIT_MODE}`,
            order: '10'
        });
        menus.registerMenuAction([menuId], {
            commandId: NotebookCellCommands.SPLIT_CELL_COMMAND.id,
            icon: NotebookCellCommands.SPLIT_CELL_COMMAND.iconClass,
            order: '20'
        });
        menus.registerMenuAction([menuId], {
            commandId: NotebookCellCommands.DELETE_COMMAND.id,
            icon: NotebookCellCommands.DELETE_COMMAND.iconClass,
            order: '30'
        });

        const moreMenuPath = [menuId, 'more'];
        menus.registerSubmenu(moreMenuPath, 'more', { icon: codicon('ellipsis'), role: CompoundMenuNodeRole.Submenu, order: '100' });
        menus.registerMenuAction(moreMenuPath, {
            commandId: NotebookCellCommands.EDIT_COMMAND.id,
            label: 'test submenu item',
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(NotebookCellCommands.EDIT_COMMAND, { execute: this.requestCellEdit });
        commands.registerCommand(NotebookCellCommands.STOP_EDIT_COMMAND, { execute: (_, cell: NotebookCellModel) => cell.requestStopEdit() });
        commands.registerCommand(NotebookCellCommands.DELETE_COMMAND, { execute: this.runDeleteAction });
        commands.registerCommand(NotebookCellCommands.SPLIT_CELL_COMMAND);
    }

}
