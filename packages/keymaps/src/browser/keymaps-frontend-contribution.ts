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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
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
import { CommonCommands, CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { KeymapsService } from './keymaps-service';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { KeybindingWidget } from './keybindings-widget';
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
}

@injectable()
export class KeymapsFrontendContribution extends AbstractViewContribution<KeybindingWidget> implements CommandContribution, MenuContribution, TabBarToolbarContribution {

    @inject(KeymapsService)
    protected readonly keymaps: KeymapsService;

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
    }

    override registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_SETTINGS_SUBMENU_OPEN, {
            commandId: KeymapsCommands.OPEN_KEYMAPS.id,
            order: 'a20'
        });
        menus.registerMenuAction(CommonMenus.SETTINGS_OPEN, {
            commandId: KeymapsCommands.OPEN_KEYMAPS.id,
            order: 'a20'
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
}
