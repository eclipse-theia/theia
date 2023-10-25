// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import {
    CommandContribution,
    Command,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry
} from '@theia/core/lib/common';
import { AbstractViewContribution, codicon, Widget } from '@theia/core/lib/browser';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { CommonCommands, CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { KeymapsService } from './keymaps-service';
import { Keybinding } from '@theia/core/lib/common/keybinding';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { KeybindingItem, KeybindingWidget } from './keybindings-widget';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { nls } from '@theia/core/lib/common/nls';

export namespace KeymapsCommands {
    export const OPEN_KEYMAPS = Command.toDefaultLocalizedCommand({
        id: 'keymaps:open',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Open Keyboard Shortcuts',
    });
    export const OPEN_KEYMAPS_JSON = Command.toDefaultLocalizedCommand({
        id: 'keymaps:openJson',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Open Keyboard Shortcuts (JSON)',
    });
    export const OPEN_KEYMAPS_JSON_TOOLBAR: Command = {
        id: 'keymaps:openJson.toolbar',
        iconClass: codicon('json')
    };
    export const CLEAR_KEYBINDINGS_SEARCH: Command = {
        id: 'keymaps.clearSearch',
        iconClass: codicon('clear-all')
    };
    export const COPY_KEYBINDING = Command.toLocalizedCommand({
        id: 'keymaps:keybinding.copy',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Copy Keybinding'
    }, 'theia/keymaps/keybinding/copy', CommonCommands.PREFERENCES_CATEGORY_KEY);
    export const COPY_COMMAND_ID = Command.toLocalizedCommand({
        id: 'keymaps:keybinding.copyCommandId',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Copy Keybinding Command ID'
    }, 'theia/keymaps/keybinding/copyCommandId', CommonCommands.PREFERENCES_CATEGORY_KEY);
    export const COPY_COMMAND_TITLE = Command.toLocalizedCommand({
        id: 'keymaps:keybinding.copyCommandTitle',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Copy Keybinding Command Title'
    }, 'theia/keymaps/keybinding/copyCommandTitle', CommonCommands.PREFERENCES_CATEGORY_KEY);
    export const EDIT_KEYBINDING = Command.toLocalizedCommand({
        id: 'keymaps:keybinding.edit',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Edit Keybinding...'
    }, 'theia/keymaps/keybinding/edit', CommonCommands.PREFERENCES_CATEGORY_KEY);
    export const EDIT_WHEN_EXPRESSION = Command.toLocalizedCommand({
        id: 'keymaps:keybinding.editWhenExpression',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Edit Keybinding When Expression...'
    }, 'theia/keymaps/keybinding/editWhenExpression', CommonCommands.PREFERENCES_CATEGORY_KEY);
    export const ADD_KEYBINDING = Command.toDefaultLocalizedCommand({
        id: 'keymaps:keybinding.add',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Add Keybinding...'
    });
    export const REMOVE_KEYBINDING = Command.toDefaultLocalizedCommand({
        id: 'keymaps:keybinding.remove',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Remove Keybinding'
    });
    export const RESET_KEYBINDING = Command.toDefaultLocalizedCommand({
        id: 'keymaps:keybinding.reset',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Reset Keybinding'
    });
    export const SHOW_SAME = Command.toDefaultLocalizedCommand({
        id: 'keymaps:keybinding.showSame',
        category: CommonCommands.PREFERENCES_CATEGORY,
        label: 'Show Same Keybindings'
    });
}

@injectable()
export class KeymapsFrontendContribution extends AbstractViewContribution<KeybindingWidget> implements CommandContribution, MenuContribution, TabBarToolbarContribution {

    @inject(KeymapsService)
    protected readonly keymaps: KeymapsService;

    @inject(ClipboardService)
    protected readonly clipboard: ClipboardService;

    constructor() {
        super({
            widgetId: KeybindingWidget.ID,
            widgetName: KeybindingWidget.LABEL,
            defaultWidgetOptions: {
                area: 'main'
            },
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(KeymapsCommands.OPEN_KEYMAPS, {
            isEnabled: () => true,
            execute: () => this.openView({ activate: true })
        });
        commands.registerCommand(KeymapsCommands.OPEN_KEYMAPS_JSON, {
            isEnabled: () => true,
            execute: () => this.keymaps.open()
        });
        commands.registerCommand(KeymapsCommands.OPEN_KEYMAPS_JSON_TOOLBAR, {
            isEnabled: w => this.withWidget(w, () => true),
            isVisible: w => this.withWidget(w, () => true),
            execute: w => this.withWidget(w, widget => this.keymaps.open(widget)),
        });
        commands.registerCommand(KeymapsCommands.CLEAR_KEYBINDINGS_SEARCH, {
            isEnabled: w => this.withWidget(w, widget => widget.hasSearch()),
            isVisible: w => this.withWidget(w, () => true),
            execute: w => this.withWidget(w, widget => widget.clearSearch()),
        });
        commands.registerCommand(KeymapsCommands.COPY_KEYBINDING, {
            isEnabled: (...args) => this.withItem(() => true, ...args),
            isVisible: (...args) => this.withItem(() => true, ...args),
            execute: (...args) => this.withItem(item => this.clipboard.writeText(
                JSON.stringify(Keybinding.apiObjectify(KeybindingItem.keybinding(item)), undefined, '  ')
            ), ...args)
        });
        commands.registerCommand(KeymapsCommands.COPY_COMMAND_ID, {
            isEnabled: (...args) => this.withItem(() => true, ...args),
            isVisible: (...args) => this.withItem(() => true, ...args),
            execute: (...args) => this.withItem(item => this.clipboard.writeText(item.command.id), ...args)
        });
        commands.registerCommand(KeymapsCommands.COPY_COMMAND_TITLE, {
            isEnabled: (...args) => this.withItem(item => !!item.command.label, ...args),
            isVisible: (...args) => this.withItem(() => true, ...args),
            execute: (...args) => this.withItem(item => this.clipboard.writeText(item.command.label!), ...args)
        });
        commands.registerCommand(KeymapsCommands.EDIT_KEYBINDING, {
            isEnabled: (...args) => this.withWidgetItem(() => true, ...args),
            isVisible: (...args) => this.withWidgetItem(() => true, ...args),
            execute: (...args) => this.withWidgetItem((item, widget) => widget.editKeybinding(item), ...args)
        });
        commands.registerCommand(KeymapsCommands.EDIT_WHEN_EXPRESSION, {
            isEnabled: (...args) => this.withWidgetItem(item => !!item.keybinding, ...args),
            isVisible: (...args) => this.withWidgetItem(() => true, ...args),
            execute: (...args) => this.withWidgetItem((item, widget) => widget.editWhenExpression(item), ...args)
        });
        commands.registerCommand(KeymapsCommands.ADD_KEYBINDING, {
            isEnabled: (...args) => this.withWidgetItem(item => !!item.keybinding, ...args),
            isVisible: (...args) => this.withWidgetItem(item => !!item.keybinding, ...args),
            execute: (...args) => this.withWidgetItem((item, widget) => widget.addKeybinding(item), ...args)
        });
        commands.registerCommand(KeymapsCommands.REMOVE_KEYBINDING, {
            isEnabled: (...args) => this.withItem(item => !!item.keybinding, ...args),
            isVisible: (...args) => this.withItem(() => true, ...args),
            execute: (...args) => this.withItem(item => this.keymaps.unsetKeybinding(item.keybinding!), ...args)
        });
        commands.registerCommand(KeymapsCommands.RESET_KEYBINDING, {
            isEnabled: (...args) => this.withWidgetItem((item, widget) => widget.canResetKeybinding(item), ...args),
            isVisible: (...args) => this.withWidgetItem(() => true, ...args),
            execute: (...args) => this.withWidgetItem((item, widget) => widget.resetKeybinding(item), ...args)
        });
        commands.registerCommand(KeymapsCommands.SHOW_SAME, {
            isEnabled: (...args) => this.withWidgetItem(item => !!item.keybinding, ...args),
            isVisible: (...args) => this.withWidgetItem(() => true, ...args),
            execute: (...args) => this.withWidgetItem((item, widget) => widget.showSameKeybindings(item), ...args)
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_SETTINGS_SUBMENU_OPEN, {
            commandId: KeymapsCommands.OPEN_KEYMAPS.id,
            label: nls.localizeByDefault('Keyboard Shortcuts'),
            order: 'a20'
        });
        menus.registerMenuAction(CommonMenus.MANAGE_SETTINGS, {
            commandId: KeymapsCommands.OPEN_KEYMAPS.id,
            label: nls.localizeByDefault('Keyboard Shortcuts'),
            order: 'a30'
        });
        menus.registerMenuAction(KeybindingWidget.COPY_MENU, {
            commandId: KeymapsCommands.COPY_KEYBINDING.id,
            label: nls.localizeByDefault('Copy'),
            order: 'a'
        });
        menus.registerMenuAction(KeybindingWidget.COPY_MENU, {
            commandId: KeymapsCommands.COPY_COMMAND_ID.id,
            label: nls.localizeByDefault('Copy Command ID'),
            order: 'b'
        });
        menus.registerMenuAction(KeybindingWidget.COPY_MENU, {
            commandId: KeymapsCommands.COPY_COMMAND_TITLE.id,
            label: nls.localizeByDefault('Copy Command Title'),
            order: 'c'
        });
        menus.registerMenuAction(KeybindingWidget.EDIT_MENU, {
            commandId: KeymapsCommands.EDIT_KEYBINDING.id,
            label: nls.localize('theia/keymaps/editKeybinding', 'Edit Keybinding...'),
            order: 'a'
        });
        menus.registerMenuAction(KeybindingWidget.EDIT_MENU, {
            commandId: KeymapsCommands.EDIT_WHEN_EXPRESSION.id,
            label: nls.localize('theia/keymaps/editWhenExpression', 'Edit When Expression...'),
            order: 'b'
        });
        menus.registerMenuAction(KeybindingWidget.ADD_MENU, {
            commandId: KeymapsCommands.ADD_KEYBINDING.id,
            label: nls.localizeByDefault('Add Keybinding...'),
            order: 'a'
        });
        menus.registerMenuAction(KeybindingWidget.REMOVE_MENU, {
            commandId: KeymapsCommands.REMOVE_KEYBINDING.id,
            label: nls.localizeByDefault('Remove Keybinding'),
            order: 'a'
        });
        menus.registerMenuAction(KeybindingWidget.REMOVE_MENU, {
            commandId: KeymapsCommands.RESET_KEYBINDING.id,
            label: nls.localizeByDefault('Reset Keybinding'),
            order: 'b'
        });
        menus.registerMenuAction(KeybindingWidget.SHOW_MENU, {
            commandId: KeymapsCommands.SHOW_SAME.id,
            label: nls.localizeByDefault('Show Same Keybindings'),
            order: 'a'
        });
    }

    override registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: KeymapsCommands.OPEN_KEYMAPS.id,
            keybinding: 'ctrl+alt+,'
        });
    }

    async registerToolbarItems(toolbar: TabBarToolbarRegistry): Promise<void> {
        const widget = await this.widget;
        const onDidChange = widget.onDidUpdate;
        toolbar.registerItem({
            id: KeymapsCommands.OPEN_KEYMAPS_JSON_TOOLBAR.id,
            command: KeymapsCommands.OPEN_KEYMAPS_JSON_TOOLBAR.id,
            tooltip: nls.localizeByDefault('Open Keyboard Shortcuts (JSON)'),
            priority: 0,
        });
        toolbar.registerItem({
            id: KeymapsCommands.CLEAR_KEYBINDINGS_SEARCH.id,
            command: KeymapsCommands.CLEAR_KEYBINDINGS_SEARCH.id,
            tooltip: nls.localizeByDefault('Clear Keybindings Search Input'),
            priority: 1,
            onDidChange,
        });
    }

    /**
     * Determine if the current widget is the keybindings widget.
     */
    protected withWidget<T>(widget: Widget | undefined = this.tryGetWidget(), fn: (widget: KeybindingWidget) => T): T | false {
        if (widget instanceof KeybindingWidget && widget.id === KeybindingWidget.ID) {
            return fn(widget);
        }
        return false;
    }

    protected withItem<T>(fn: (item: KeybindingItem, ...rest: unknown[]) => T, ...args: unknown[]): T | false {
        const [item] = args;
        if (KeybindingItem.is(item)) {
            return fn(item, args.slice(1));
        }
        return false;
    }

    protected withWidgetItem<T>(fn: (item: KeybindingItem, widget: KeybindingWidget, ...rest: unknown[]) => T, ...args: unknown[]): T | false {
        const [item, widget] = args;
        if (widget instanceof KeybindingWidget && widget.id === KeybindingWidget.ID && KeybindingItem.is(item)) {
            return fn(item, widget, args.slice(2));
        }
        return false;
    }
}
