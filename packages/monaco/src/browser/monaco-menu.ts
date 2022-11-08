// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { MenuContribution, MenuModelRegistry, MAIN_MENU_BAR, MenuPath, MenuAction } from '@theia/core/lib/common';
import { EditorMainMenu, EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { MonacoCommandRegistry } from './monaco-command-registry';
import { nls } from '@theia/core/lib/common/nls';
import { IMenuItem, isIMenuItem, MenuId, MenuRegistry } from '@theia/monaco-editor-core/esm/vs/platform/actions/common/actions';

export interface MonacoActionGroup {
    id: string;
    actions: string[];
}
export namespace MonacoMenus {
    export const SELECTION = [...MAIN_MENU_BAR, '3_selection'];
    export const PEEK_CONTEXT_SUBMENU: MenuPath = [...EDITOR_CONTEXT_MENU, 'navigation', 'peek_submenu'];
    export const MARKERS_GROUP = [...EditorMainMenu.GO, '5_markers_group'];
}

@injectable()
export class MonacoEditorMenuContribution implements MenuContribution {

    constructor(
        @inject(MonacoCommandRegistry) protected readonly commands: MonacoCommandRegistry
    ) { }

    registerMenus(registry: MenuModelRegistry): void {
        for (const item of MenuRegistry.getMenuItems(MenuId.EditorContext)) {
            if (!isIMenuItem(item)) {
                continue;
            }
            const commandId = this.commands.validate(item.command.id);
            if (commandId) {
                const menuPath = [...EDITOR_CONTEXT_MENU, (item.group || '')];
                registry.registerMenuAction(menuPath, this.buildMenuAction(commandId, item));
            }
        }

        this.registerPeekSubmenu(registry);

        registry.registerSubmenu(MonacoMenus.SELECTION, nls.localizeByDefault('Selection'));
        for (const item of MenuRegistry.getMenuItems(MenuId.MenubarSelectionMenu)) {
            if (!isIMenuItem(item)) {
                continue;
            }
            const commandId = this.commands.validate(item.command.id);
            if (commandId) {
                const menuPath = [...MonacoMenus.SELECTION, (item.group || '')];
                registry.registerMenuAction(menuPath, this.buildMenuAction(commandId, item));
            }
        }

        // Builtin monaco language features commands.
        registry.registerMenuAction(EditorMainMenu.LANGUAGE_FEATURES_GROUP, {
            commandId: 'editor.action.quickOutline',
            label: nls.localizeByDefault('Go to Symbol in Editor...'),
            order: '1'
        });
        registry.registerMenuAction(EditorMainMenu.LANGUAGE_FEATURES_GROUP, {
            commandId: 'editor.action.revealDefinition',
            label: nls.localizeByDefault('Go to Definition'),
            order: '2'
        });
        registry.registerMenuAction(EditorMainMenu.LANGUAGE_FEATURES_GROUP, {
            commandId: 'editor.action.revealDeclaration',
            label: nls.localizeByDefault('Go to Declaration'),
            order: '3'
        });
        registry.registerMenuAction(EditorMainMenu.LANGUAGE_FEATURES_GROUP, {
            commandId: 'editor.action.goToTypeDefinition',
            label: nls.localizeByDefault('Go to Type Definition'),
            order: '4'
        });
        registry.registerMenuAction(EditorMainMenu.LANGUAGE_FEATURES_GROUP, {
            commandId: 'editor.action.goToImplementation',
            label: nls.localizeByDefault('Go to Implementations'),
            order: '5'
        });
        registry.registerMenuAction(EditorMainMenu.LANGUAGE_FEATURES_GROUP, {
            commandId: 'editor.action.goToReferences',
            label: nls.localizeByDefault('Go to References'),
            order: '6'
        });

        registry.registerMenuAction(EditorMainMenu.LOCATION_GROUP, {
            commandId: 'editor.action.jumpToBracket',
            label: nls.localizeByDefault('Go to Bracket'),
            order: '2'
        });

        // Builtin monaco problem commands.
        registry.registerMenuAction(MonacoMenus.MARKERS_GROUP, {
            commandId: 'editor.action.marker.nextInFiles',
            label: nls.localizeByDefault('Next Problem'),
            order: '1'
        });
        registry.registerMenuAction(MonacoMenus.MARKERS_GROUP, {
            commandId: 'editor.action.marker.prevInFiles',
            label: nls.localizeByDefault('Previous Problem'),
            order: '2'
        });
    }

    protected registerPeekSubmenu(registry: MenuModelRegistry): void {
        registry.registerSubmenu(MonacoMenus.PEEK_CONTEXT_SUBMENU, nls.localizeByDefault('Peek'));

        for (const item of MenuRegistry.getMenuItems(MenuId.EditorContextPeek)) {
            if (!isIMenuItem(item)) {
                continue;
            }
            const commandId = this.commands.validate(item.command.id);
            if (commandId) {
                registry.registerMenuAction([...MonacoMenus.PEEK_CONTEXT_SUBMENU, item.group || ''], this.buildMenuAction(commandId, item));
            }
        }
    }

    protected buildMenuAction(commandId: string, item: IMenuItem): MenuAction {
        const title = typeof item.command.title === 'string' ? item.command.title : item.command.title.value;
        const label = this.removeMnemonic(title);
        const order = item.order ? String(item.order) : '';
        return { commandId, order, label };
    }

    protected removeMnemonic(label: string): string {
        return label.replace(/\(&&\w\)|&&/g, '');
    }
}
