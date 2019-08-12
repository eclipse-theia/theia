/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject } from 'inversify';
import { MenuContribution, MenuModelRegistry, MAIN_MENU_BAR } from '@theia/core/lib/common';
import { EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { MonacoCommands } from './monaco-command';
import { MonacoCommandRegistry } from './monaco-command-registry';
import MenuRegistry = monaco.actions.MenuRegistry;

export interface MonacoActionGroup {
    id: string;
    actions: string[];
}
export namespace MonacoMenus {
    export const SELECTION = [...MAIN_MENU_BAR, '3_selection'];

    export const SELECTION_GROUP: MonacoActionGroup = {
        id: '1_selection_group',
        actions: [
            MonacoCommands.SELECTION_SELECT_ALL,
            MonacoCommands.SELECTION_EXPAND_SELECTION,
            MonacoCommands.SELECTION_SHRINK_SELECTION
        ]
    };

    export const SELECTION_MOVE_GROUP: MonacoActionGroup = {
        id: '2_copy_move_group',
        actions: [
            MonacoCommands.SELECTION_COPY_LINE_UP,
            MonacoCommands.SELECTION_COPY_LINE_DOWN,
            MonacoCommands.SELECTION_MOVE_LINE_UP,
            MonacoCommands.SELECTION_MOVE_LINE_DOWN
        ]
    };

    export const SELECTION_CURSOR_GROUP: MonacoActionGroup = {
        id: '3_cursor_group',
        actions: [
            MonacoCommands.SELECTION_ADD_CURSOR_ABOVE,
            MonacoCommands.SELECTION_ADD_CURSOR_BELOW,
            MonacoCommands.SELECTION_ADD_CURSOR_TO_LINE_END,
            MonacoCommands.SELECTION_ADD_NEXT_OCCURRENCE,
            MonacoCommands.SELECTION_ADD_PREVIOUS_OCCURRENCE,
            MonacoCommands.SELECTION_SELECT_ALL_OCCURRENCES
        ]
    };

    export const SELECTION_GROUPS = [
        SELECTION_GROUP,
        SELECTION_MOVE_GROUP,
        SELECTION_CURSOR_GROUP
    ];
}

@injectable()
export class MonacoEditorMenuContribution implements MenuContribution {

    constructor(
        @inject(MonacoCommandRegistry) protected readonly commands: MonacoCommandRegistry
    ) { }

    registerMenus(registry: MenuModelRegistry): void {
        for (const item of MenuRegistry.getMenuItems(7)) {
            const commandId = this.commands.validate(item.command.id);
            if (commandId) {
                const menuPath = [...EDITOR_CONTEXT_MENU, (item.group || '')];
                registry.registerMenuAction(menuPath, { commandId });
            }
        }

        registry.registerSubmenu(MonacoMenus.SELECTION, 'Selection');
        for (const group of MonacoMenus.SELECTION_GROUPS) {
            group.actions.forEach((action, index) => {
                const commandId = this.commands.validate(action);
                if (commandId) {
                    const path = [...MonacoMenus.SELECTION, group.id];
                    const order = index.toString();
                    registry.registerMenuAction(path, { commandId, order });
                }
            });
        }
    }
}
