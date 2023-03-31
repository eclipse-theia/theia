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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Command, CommandContribution, CommandRegistry, CompoundMenuNodeRole, MenuContribution, MenuModelRegistry } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { injectable } from '@theia/core/shared/inversify';
import { requestCellEdit, runDeleteAction } from './cellOperations';

export namespace NotebookCellCommands {
    export const EDIT_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.edit',
        iconClass: codicon('edit')
    });
    export const DELETE_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.delete',
        iconClass: codicon('trash')
    });
    export const SPLIT_CELL_COMMAND = Command.toDefaultLocalizedCommand({
        id: 'notebook.cell.split-cell',
        iconClass: codicon('split-vertical')
    });
}

@injectable()
export class NotebookCellActionContribution implements MenuContribution, CommandContribution {

    registerMenus(menus: MenuModelRegistry): void {
        const menuId = 'notbook-cell-acions-menu';
        menus.registerIndependentSubmenu(menuId, '');
        menus.registerMenuAction([menuId], { commandId: NotebookCellCommands.EDIT_COMMAND.id, icon: NotebookCellCommands.EDIT_COMMAND.iconClass });
        menus.registerMenuAction([menuId], { commandId: NotebookCellCommands.SPLIT_CELL_COMMAND.id, icon: NotebookCellCommands.SPLIT_CELL_COMMAND.iconClass });
        menus.registerMenuAction([menuId], { commandId: NotebookCellCommands.DELETE_COMMAND.id, icon: NotebookCellCommands.DELETE_COMMAND.iconClass });

        const moreMenuPath = [menuId, 'more'];
        menus.registerSubmenu(moreMenuPath, 'more', { icon: codicon('ellipsis'), role: CompoundMenuNodeRole.Submenu });
        menus.registerMenuAction(moreMenuPath, {
            commandId: NotebookCellCommands.EDIT_COMMAND.id,
            label: 'test submenu item',
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(NotebookCellCommands.EDIT_COMMAND, { execute: requestCellEdit });
        commands.registerCommand(NotebookCellCommands.DELETE_COMMAND, { execute: runDeleteAction });
        commands.registerCommand(NotebookCellCommands.SPLIT_CELL_COMMAND);
    }

}
