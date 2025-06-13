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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { MenuContribution, MenuModelRegistry, MenuPath, MAIN_MENU_BAR } from '@theia/core';
import { CommonCommands, CommonMenus } from '@theia/core/lib/browser';
import { EditorCommands } from './editor-command';
import { nls } from '@theia/core/lib/common/nls';

export const EDITOR_CONTEXT_MENU: MenuPath = ['editor_context_menu'];

/** Corresponds to `editor/content` contribution point in VS Code. */
export const EDITOR_CONTENT_MENU: MenuPath = ['editor_content_menu'];

/**
 * Editor context menu default groups should be aligned
 * with VS Code default groups: https://code.visualstudio.com/api/references/contribution-points#contributes.menus
 */
export namespace EditorContextMenu {
    export const NAVIGATION = [...EDITOR_CONTEXT_MENU, 'navigation'];
    export const MODIFICATION = [...EDITOR_CONTEXT_MENU, '1_modification'];
    export const CUT_COPY_PASTE = [...EDITOR_CONTEXT_MENU, '9_cutcopypaste'];
    export const COMMANDS = [...EDITOR_CONTEXT_MENU, 'z_commands'];
    export const UNDO_REDO = [...EDITOR_CONTEXT_MENU, '1_undo'];
}

export namespace EditorMainMenu {

    /**
     * The main `Go` menu item.
     */
    export const GO = [...MAIN_MENU_BAR, '5_go'];

    /**
     * Navigation menu group in the `Go` main-menu.
     */
    export const NAVIGATION_GROUP = [...GO, '1_navigation_group'];

    /**
     * Context management group in the `Go` main menu: Pane and editor switching commands.
     */
    export const CONTEXT_GROUP = [...GO, '1.1_context_group'];

    /**
     * Submenu for switching panes in the main area.
     */
    export const PANE_GROUP = [...CONTEXT_GROUP, '2_pane_group'];
    export const BY_NUMBER = [...EditorMainMenu.PANE_GROUP, '1_by_number'];
    export const NEXT_PREVIOUS = [...EditorMainMenu.PANE_GROUP, '2_by_location'];

    /**
     * Workspace menu group in the `Go` main-menu.
     */
    export const WORKSPACE_GROUP = [...GO, '2_workspace_group'];

    /**
     * Language features menu group in the `Go` main-menu.
     */
    export const LANGUAGE_FEATURES_GROUP = [...GO, '3_language_features_group'];

    /**
     * Location menu group in the `Go` main-menu.
     */
    export const LOCATION_GROUP = [...GO, '4_locations'];

}

@injectable()
export class EditorMenuContribution implements MenuContribution {

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(EditorContextMenu.UNDO_REDO, {
            commandId: CommonCommands.UNDO.id
        });
        registry.registerMenuAction(EditorContextMenu.UNDO_REDO, {
            commandId: CommonCommands.REDO.id
        });

        registry.registerMenuAction(EditorContextMenu.CUT_COPY_PASTE, {
            commandId: CommonCommands.CUT.id,
            order: '0'
        });
        registry.registerMenuAction(EditorContextMenu.CUT_COPY_PASTE, {
            commandId: CommonCommands.COPY.id,
            order: '1'
        });
        registry.registerMenuAction(EditorContextMenu.CUT_COPY_PASTE, {
            commandId: CommonCommands.PASTE.id,
            order: '2'
        });

        // Editor navigation. Go > Back and Go > Forward.
        registry.registerSubmenu(EditorMainMenu.GO, nls.localizeByDefault('Go'));
        registry.registerMenuAction(EditorMainMenu.NAVIGATION_GROUP, {
            commandId: EditorCommands.GO_BACK.id,
            label: EditorCommands.GO_BACK.label,
            order: '1'
        });
        registry.registerMenuAction(EditorMainMenu.NAVIGATION_GROUP, {
            commandId: EditorCommands.GO_FORWARD.id,
            label: EditorCommands.GO_FORWARD.label,
            order: '2'
        });
        registry.registerMenuAction(EditorMainMenu.NAVIGATION_GROUP, {
            commandId: EditorCommands.GO_LAST_EDIT.id,
            label: nls.localizeByDefault('Last Edit Location'),
            order: '3'
        });

        registry.registerSubmenu(EditorMainMenu.PANE_GROUP, nls.localizeByDefault('Switch Group'));

        registry.registerMenuAction(EditorMainMenu.BY_NUMBER, {
            commandId: 'workbench.action.focusFirstEditorGroup',
            label: nls.localizeByDefault('Group 1'),
        });
        registry.registerMenuAction(EditorMainMenu.BY_NUMBER, {
            commandId: 'workbench.action.focusSecondEditorGroup',
            label: nls.localizeByDefault('Group 2'),
        });
        registry.registerMenuAction(EditorMainMenu.BY_NUMBER, {
            commandId: 'workbench.action.focusThirdEditorGroup',
            label: nls.localizeByDefault('Group 3'),
        });
        registry.registerMenuAction(EditorMainMenu.BY_NUMBER, {
            commandId: 'workbench.action.focusFourthEditorGroup',
            label: nls.localizeByDefault('Group 4'),
        });
        registry.registerMenuAction(EditorMainMenu.BY_NUMBER, {
            commandId: 'workbench.action.focusFifthEditorGroup',
            label: nls.localizeByDefault('Group 5'),
        });

        registry.registerMenuAction(EditorMainMenu.NEXT_PREVIOUS, {
            commandId: CommonCommands.NEXT_TAB_GROUP.id,
            label: nls.localizeByDefault('Next Group'),
            order: '1'
        });
        registry.registerMenuAction(EditorMainMenu.NEXT_PREVIOUS, {
            commandId: CommonCommands.PREVIOUS_TAB_GROUP.id,
            label: nls.localizeByDefault('Previous Group'),
            order: '2'
        });

        registry.registerMenuAction(EditorMainMenu.LOCATION_GROUP, {
            commandId: EditorCommands.GOTO_LINE_COLUMN.id,
            order: '1'
        });

        // Toggle Commands.
        registry.registerMenuAction(CommonMenus.VIEW_TOGGLE, {
            commandId: EditorCommands.TOGGLE_WORD_WRAP.id,
            order: '0'
        });
        registry.registerMenuAction(CommonMenus.VIEW_TOGGLE, {
            commandId: EditorCommands.TOGGLE_MINIMAP.id,
            order: '1',
        });
        registry.registerMenuAction(CommonMenus.VIEW_TOGGLE, {
            commandId: CommonCommands.TOGGLE_BREADCRUMBS.id,
            order: '2',
        });
        registry.registerMenuAction(CommonMenus.VIEW_TOGGLE, {
            commandId: EditorCommands.TOGGLE_RENDER_WHITESPACE.id,
            order: '3'
        });
        registry.registerMenuAction(CommonMenus.VIEW_TOGGLE, {
            commandId: EditorCommands.TOGGLE_STICKY_SCROLL.id,
            order: '4'
        });
        registry.registerMenuAction(CommonMenus.FILE_CLOSE, {
            commandId: CommonCommands.CLOSE_MAIN_TAB.id,
            label: nls.localizeByDefault('Close Editor'),
            order: '1'
        });
        registry.registerMenuAction(CommonMenus.VIEW_EDITOR_SUBMENU_SPLIT, {
            commandId: EditorCommands.SPLIT_EDITOR_RIGHT.id,
            label: nls.localizeByDefault('Split Editor Right'),
            order: '0'
        });

        registry.registerMenuAction(CommonMenus.VIEW_EDITOR_SUBMENU_SPLIT, {
            commandId: EditorCommands.SPLIT_EDITOR_LEFT.id,
            label: nls.localizeByDefault('Split Editor Left'),
            order: '1'
        });

        registry.registerMenuAction(CommonMenus.VIEW_EDITOR_SUBMENU_SPLIT, {
            commandId: EditorCommands.SPLIT_EDITOR_UP.id,
            label: nls.localizeByDefault('Split Editor Up'),
            order: '2'
        });

        registry.registerMenuAction(CommonMenus.VIEW_EDITOR_SUBMENU_SPLIT, {
            commandId: EditorCommands.SPLIT_EDITOR_DOWN.id,
            label: nls.localizeByDefault('Split Editor Down'),
            order: '3'
        });

        registry.registerMenuAction(CommonMenus.VIEW_EDITOR_SUBMENU_ORTHO, {
            commandId: EditorCommands.SPLIT_EDITOR_HORIZONTAL.id,
            label: nls.localize('theia/editor/splitHorizontal', 'Split Editor Horizontal'),
            order: '1'
        });

        registry.registerMenuAction(CommonMenus.VIEW_EDITOR_SUBMENU_ORTHO, {
            commandId: EditorCommands.SPLIT_EDITOR_VERTICAL.id,
            label: nls.localize('theia/editor/splitVertical', 'Split Editor Vertical'),
            order: '2'
        });

        registry.registerSubmenu(CommonMenus.VIEW_EDITOR_SUBMENU, nls.localizeByDefault('Editor Layout'));
    }

}
