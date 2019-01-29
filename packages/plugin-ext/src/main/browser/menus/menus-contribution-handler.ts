/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { MenuPath, ILogger, CommandRegistry } from '@theia/core';
import { EDITOR_CONTEXT_MENU, EditorWidget } from '@theia/editor/lib/browser';
import { MenuModelRegistry } from '@theia/core/lib/common';
import { BuiltinThemeProvider } from '@theia/core/lib/browser/theming';
import { TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-contribution';
import { QuickCommandService } from '@theia/core/lib/browser/quick-open/quick-command-service';
import { VIEW_ITEM_CONTEXT_MENU } from '../view/tree-views-main';
import { PluginContribution, Menu, PluginCommand } from '../../../common';
import { PluginSharedStyle } from '../plugin-shared-style';
import { DebugStackFramesWidget } from '@theia/debug/lib/browser/view/debug-stack-frames-widget';
import { DebugThreadsWidget } from '@theia/debug/lib/browser/view/debug-threads-widget';

@injectable()
export class MenusContributionPointHandler {

    @inject(MenuModelRegistry)
    protected readonly menuRegistry: MenuModelRegistry;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(QuickCommandService)
    protected readonly quickCommandService: QuickCommandService;

    @inject(TabBarToolbarRegistry)
    protected readonly tabBarToolbar: TabBarToolbarRegistry;

    @inject(PluginSharedStyle)
    protected readonly style: PluginSharedStyle;

    handle(contributions: PluginContribution): void {
        const allMenus = contributions.menus;
        if (!allMenus) {
            return;
        }
        for (const location in allMenus) {
            if (location === 'commandPalette') {
                for (const menu of allMenus[location]) {
                    if (menu.when) {
                        this.quickCommandService.pushCommandContext(menu.command, menu.when);
                    }
                }
            } else if (location === 'editor/title') {
                this.registerEditorTitleActions(allMenus[location], contributions);
            } else if (allMenus.hasOwnProperty(location)) {
                const menuPaths = MenusContributionPointHandler.parseMenuPaths(location);
                if (!menuPaths.length) {
                    this.logger.warn(`Plugin contributes items to a menu with invalid identifier: ${location}`);
                    continue;
                }
                const menus = allMenus[location];
                menus.forEach(menu => {
                    for (const menuPath of menuPaths) {
                        this.registerMenuAction(menuPath, menu);
                    }
                });
            }
        }
    }

    protected registerEditorTitleActions(actions: Menu[], contributions: PluginContribution): void {
        if (!contributions.commands || !actions.length) {
            return;
        }
        const commands = new Map(contributions.commands.map(c => [c.command, c] as [string, PluginCommand]));
        for (const action of actions) {
            const pluginCommand = commands.get(action.command);
            if (pluginCommand) {
                this.registerEditorTitleAction(action, pluginCommand);
            }
        }
    }

    protected editorTitleActionId = 0;
    protected registerEditorTitleAction(action: Menu, pluginCommand: PluginCommand): void {
        const id = pluginCommand.command;
        const command = '__editor.title.' + id;
        const tooltip = pluginCommand.title;
        const iconClass = 'plugin-editor-title-action-' + this.editorTitleActionId++;
        const { group, when } = action;

        const { iconUrl } = pluginCommand;
        const darkIconUrl = typeof iconUrl === 'object' ? iconUrl.dark : iconUrl;
        const lightIconUrl = typeof iconUrl === 'object' ? iconUrl.light : iconUrl;
        this.style.insertRule('.' + iconClass, theme => `
            width: 16px;
            height: 16px;
            background: no-repeat url("${theme.id === BuiltinThemeProvider.lightTheme.id ? lightIconUrl : darkIconUrl}");
        `);

        this.commands.registerCommand({ id: command, iconClass }, {
            execute: widget => widget instanceof EditorWidget && this.commands.executeCommand(id, widget.editor.uri),
            isEnabled: widget => widget instanceof EditorWidget,
            isVisible: widget => widget instanceof EditorWidget
        });
        this.tabBarToolbar.registerItem({ id, command, tooltip, group, when });
    }

    protected static parseMenuPaths(value: string): MenuPath[] {
        switch (value) {
            case 'editor/context': return [EDITOR_CONTEXT_MENU];
            case 'explorer/context': return [NAVIGATOR_CONTEXT_MENU];
            case 'view/item/context': return [VIEW_ITEM_CONTEXT_MENU];
            case 'debug/callstack/context': return [DebugStackFramesWidget.CONTEXT_MENU, DebugThreadsWidget.CONTEXT_MENU];
        }
        return [];
    }

    protected registerMenuAction(menuPath: MenuPath, menu: Menu): void {
        const [group = '', order = undefined] = (menu.group || '').split('@');
        // Registering a menu action requires the related command to be already registered.
        // But Theia plugin registers the commands dynamically via the Commands API.
        // Let's wait for ~2 sec. It should be enough to finish registering all the contributed commands.
        // FIXME: remove this workaround (timer) once the https://github.com/theia-ide/theia/issues/3344 is fixed
        setTimeout(() => {
            this.menuRegistry.registerMenuAction([...menuPath, group], {
                commandId: menu.command,
                order,
                when: menu.when
            });
        }, 2000);
    }
}
