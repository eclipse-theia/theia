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

import { injectable, inject } from '@theia/core/shared/inversify';
import { MenuContribution, MenuModelRegistry, MAIN_MENU_BAR, MenuPath } from '@theia/core/lib/common';
import { EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { MonacoCommandRegistry } from './monaco-command-registry';
import MenuRegistry = monaco.actions.MenuRegistry;

export interface MonacoActionGroup {
    id: string;
    actions: string[];
}
export namespace MonacoMenus {
    export const SELECTION = [...MAIN_MENU_BAR, '3_selection'];
    export const PEEK_CONTEXT_SUBMENU: MenuPath = [...EDITOR_CONTEXT_MENU, 'navigation', 'peek_submenu'];
}

@injectable()
export class MonacoEditorMenuContribution implements MenuContribution {

    constructor(
        @inject(MonacoCommandRegistry) protected readonly commands: MonacoCommandRegistry
    ) { }

    registerMenus(registry: MenuModelRegistry): void {
        for (const item of MenuRegistry.getMenuItems(7)) {
            if (!monaco.actions.isIMenuItem(item)) {
                continue;
            }
            const commandId = this.commands.validate(item.command.id);
            if (commandId) {
                const menuPath = [...EDITOR_CONTEXT_MENU, (item.group || '')];
                registry.registerMenuAction(menuPath, { commandId });
            }
        }

        this.registerPeekSubmenu(registry);

        registry.registerSubmenu(MonacoMenus.SELECTION, 'Selection');
        for (const item of MenuRegistry.getMenuItems(25)) {
            if (!monaco.actions.isIMenuItem(item)) {
                continue;
            }
            const commandId = this.commands.validate(item.command.id);
            if (commandId) {
                const menuPath = [...MonacoMenus.SELECTION, (item.group || '')];
                const title = typeof item.command.title === 'string' ? item.command.title : item.command.title.value;
                const label = this.removeMnemonic(title);
                const order = item.order ? String(item.order) : '';
                registry.registerMenuAction(menuPath, { commandId, order, label });
            }
        }
    }

    protected registerPeekSubmenu(registry: MenuModelRegistry): void {
        registry.registerSubmenu(MonacoMenus.PEEK_CONTEXT_SUBMENU, 'Peek');

        for (const item of MenuRegistry.getMenuItems(8)) {
            if (!monaco.actions.isIMenuItem(item)) {
                continue;
            }
            const commandId = this.commands.validate(item.command.id);
            if (commandId) {
                const order = item.order ? String(item.order) : '';
                registry.registerMenuAction([...MonacoMenus.PEEK_CONTEXT_SUBMENU, item.group || ''], { commandId, order });
            }
        }
    }

    protected removeMnemonic(label: string): string {
        return label.replace(/\(&&\w\)|&&/g, '');
    }
}
