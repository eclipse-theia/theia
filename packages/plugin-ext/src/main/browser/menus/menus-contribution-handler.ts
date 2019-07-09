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

// tslint:disable:no-any

import { injectable, inject } from 'inversify';
import { MenuPath, ILogger, CommandRegistry, Command, Mutable, MenuAction, SelectionService, CommandHandler } from '@theia/core';
import { EDITOR_CONTEXT_MENU, EditorWidget } from '@theia/editor/lib/browser';
import { MenuModelRegistry } from '@theia/core/lib/common';
import { TabBarToolbarRegistry, TabBarToolbarItem } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-contribution';
import { QuickCommandService } from '@theia/core/lib/browser/quick-open/quick-command-service';
import { VIEW_ITEM_CONTEXT_MENU, TreeViewWidget, VIEW_ITEM_INLINE_MNUE } from '../view/tree-views-main';
import { PluginContribution, Menu, ScmCommandArg, TreeViewSelection } from '../../../common';
import { DebugStackFramesWidget } from '@theia/debug/lib/browser/view/debug-stack-frames-widget';
import { DebugThreadsWidget } from '@theia/debug/lib/browser/view/debug-threads-widget';
import { TreeWidgetSelection } from '@theia/core/lib/browser/tree/tree-widget-selection';
import { ScmWidget } from '@theia/scm/lib/browser/scm-widget';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { PluginScmProvider, PluginScmResourceGroup, PluginScmResource } from '../scm-main';
import { ResourceContextKey } from '@theia/core/lib/browser/resource-context-key';
import { PLUGIN_VIEW_TITLE_MENU } from '../view/plugin-view-widget';

@injectable()
export class MenusContributionPointHandler {

    @inject(MenuModelRegistry)
    protected readonly menuRegistry: MenuModelRegistry;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(QuickCommandService)
    protected readonly quickCommandService: QuickCommandService;

    @inject(TabBarToolbarRegistry)
    protected readonly tabBarToolbar: TabBarToolbarRegistry;

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    @inject(ResourceContextKey)
    protected readonly resourceContextKey: ResourceContextKey;

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
                for (const action of allMenus[location]) {
                    const selectedResource = (widget: EditorWidget) => {
                        const resourceUri = widget.getResourceUri();
                        return resourceUri && resourceUri['codeUri'];
                    };
                    this.registerTitleAction(location, action, {
                        execute: widget => widget instanceof EditorWidget && this.commands.executeCommand(action.command, selectedResource(widget)),
                        isEnabled: widget => widget instanceof EditorWidget && this.commands.isEnabled(action.command, selectedResource(widget)),
                        isVisible: widget => widget instanceof EditorWidget && this.commands.isVisible(action.command, selectedResource(widget))
                    });
                }
            } else if (location === 'view/title') {
                for (const menu of allMenus[location]) {
                    this.registerViewTitleAction(PLUGIN_VIEW_TITLE_MENU, menu);
                }
            } else if (location === 'view/item/context') {
                for (const menu of allMenus[location]) {
                    const inline = menu.group && /^inline/.test(menu.group) || false;
                    const menuPath = inline ? VIEW_ITEM_INLINE_MNUE : VIEW_ITEM_CONTEXT_MENU;
                    this.registerTreeMenuAction(menuPath, menu);
                }
            } else if (location === 'scm/title') {
                for (const action of allMenus[location]) {
                    this.registerScmTitleAction(location, action);
                }
            } else if (location === 'scm/resourceGroup/context') {
                for (const menu of allMenus[location]) {
                    const inline = menu.group && /^inline/.test(menu.group) || false;
                    const menuPath = inline ? ScmWidget.RESOURCE_GROUP_INLINE_MENU : ScmWidget.RESOURCE_GROUP_CONTEXT_MENU;
                    this.registerScmMenuAction(menuPath, menu);
                }
            } else if (location === 'scm/resourceState/context') {
                for (const menu of allMenus[location]) {
                    const inline = menu.group && /^inline/.test(menu.group) || false;
                    const menuPath = inline ? ScmWidget.RESOURCE_INLINE_MENU : ScmWidget.RESOURCE_CONTEXT_MENU;
                    this.registerScmMenuAction(menuPath, menu);
                }
            } else if (location === 'debug/callstack/context') {
                for (const menu of allMenus[location]) {
                    for (const menuPath of [DebugStackFramesWidget.CONTEXT_MENU, DebugThreadsWidget.CONTEXT_MENU]) {
                        this.registerMenuAction(menuPath, menu, {
                            execute: (...args) => this.commands.executeCommand(menu.command, args[0]),
                            isEnabled: (...args) => this.commands.isEnabled(menu.command, args[0]),
                            isVisible: (...args) => this.commands.isVisible(menu.command, args[0])
                        });
                    }
                }
            } else if (allMenus.hasOwnProperty(location)) {
                const menuPaths = MenusContributionPointHandler.parseMenuPaths(location);
                if (!menuPaths.length) {
                    this.logger.warn(`Plugin contributes items to a menu with invalid identifier: ${location}`);
                    continue;
                }
                const menus = allMenus[location];
                menus.forEach(menu => {
                    for (const menuPath of menuPaths) {
                        this.registerGlobalMenuAction(menuPath, menu);
                    }
                });
            }
        }
    }

    protected static parseMenuPaths(value: string): MenuPath[] {
        switch (value) {
            case 'editor/context': return [EDITOR_CONTEXT_MENU];
            case 'explorer/context': return [NAVIGATOR_CONTEXT_MENU];
        }
        return [];
    }

    protected registerTreeMenuAction(menuPath: MenuPath, menu: Menu): void {
        this.registerMenuAction(menuPath, menu, {
            execute: (...args) => this.commands.executeCommand(menu.command, ...this.toTreeArgs(...args)),
            isEnabled: (...args) => this.commands.isEnabled(menu.command, ...this.toTreeArgs(...args)),
            isVisible: (...args) => this.commands.isVisible(menu.command, ...this.toTreeArgs(...args))
        });
    }
    protected toTreeArgs(...args: any[]): any[] {
        const treeArgs: any[] = [];
        for (const arg of args) {
            if (TreeViewSelection.is(arg)) {
                treeArgs.push(arg);
            }
        }
        return treeArgs;
    }

    protected registerTitleAction(location: string, action: Menu, handler: CommandHandler): void {
        const id = this.createSyntheticCommandId(action, { prefix: `__plugin.${location.replace('/', '.')}.action.` });
        const command: Command = { id };
        this.commands.registerCommand(command, handler);

        const { group, when } = action;
        const item: Mutable<TabBarToolbarItem> = { id, command: id, group, when };
        this.tabBarToolbar.registerItem(item);

        this.onDidRegisterCommand(action.command, pluginCommand => {
            command.category = pluginCommand.category;
            item.tooltip = pluginCommand.label;
            if (group === undefined || group === 'navigation') {
                command.iconClass = pluginCommand.iconClass;
            }
        });
    }

    protected registerScmTitleAction(location: string, action: Menu): void {
        const selectedRepository = () => this.toScmArgs(this.scmService.selectedRepository);
        this.registerTitleAction(location, action, {
            execute: widget => widget instanceof ScmWidget && this.commands.executeCommand(action.command, selectedRepository()),
            isEnabled: widget => widget instanceof ScmWidget && this.commands.isEnabled(action.command, selectedRepository()),
            isVisible: widget => widget instanceof ScmWidget && this.commands.isVisible(action.command, selectedRepository())
        });
    }
    protected registerScmMenuAction(menuPath: MenuPath, menu: Menu): void {
        this.registerMenuAction(menuPath, menu, {
            execute: (...args) => this.commands.executeCommand(menu.command, ...this.toScmArgs(...args)),
            isEnabled: (...args) => this.commands.isEnabled(menu.command, ...this.toScmArgs(...args)),
            isVisible: (...args) => this.commands.isVisible(menu.command, ...this.toScmArgs(...args))
        });
    }
    protected toScmArgs(...args: any[]): any[] {
        const scmArgs: any[] = [];
        for (const arg of args) {
            const scmArg = this.toScmArg(arg);
            if (scmArg) {
                scmArgs.push(scmArg);
            }
        }
        return scmArgs;
    }
    protected toScmArg(arg: any): ScmCommandArg | undefined {
        if (arg instanceof ScmRepository && arg.provider instanceof PluginScmProvider) {
            return {
                sourceControlHandle: arg.provider.handle
            };
        }
        if (arg instanceof PluginScmResourceGroup) {
            return {
                sourceControlHandle: arg.provider.handle,
                resourceGroupHandle: arg.handle
            };
        }
        if (arg instanceof PluginScmResource) {
            return {
                sourceControlHandle: arg.group.provider.handle,
                resourceGroupHandle: arg.group.handle,
                resourceStateHandle: arg.handle
            };
        }
    }

    protected registerGlobalMenuAction(menuPath: MenuPath, menu: Menu): void {
        const selectedResource = () => {
            const selection = this.selectionService.selection;
            if (TreeWidgetSelection.is(selection) && selection.source instanceof TreeViewWidget && selection[0]) {
                return selection.source.toTreeViewSelection(selection[0]);
            }
            const uri = this.resourceContextKey.get();
            return uri ? uri['codeUri'] : undefined;
        };
        this.registerMenuAction(menuPath, menu, {
            execute: () => this.commands.executeCommand(menu.command, selectedResource()),
            isEnabled: () => this.commands.isEnabled(menu.command, selectedResource()),
            isVisible: () => this.commands.isVisible(menu.command, selectedResource())
        });
    }

    protected registerMenuAction(menuPath: MenuPath, menu: Menu, handler: CommandHandler): void {
        const commandId = this.createSyntheticCommandId(menu, { prefix: '__plugin.menu.action.' });
        const command: Command = { id: commandId };
        this.commands.registerCommand(command, handler);

        const { when } = menu;
        const [group = '', order = undefined] = (menu.group || '').split('@');
        const action: MenuAction = { commandId, order, when };
        const inline = /^inline/.test(group);
        menuPath = inline ? menuPath : [...menuPath, group];
        this.menuRegistry.registerMenuAction(menuPath, action);

        this.onDidRegisterCommand(menu.command, pluginCommand => {
            command.category = pluginCommand.category;
            action.label = pluginCommand.label;
            if (inline) {
                action.icon = pluginCommand.iconClass;
            }
        });
    }

    protected registerViewTitleAction(menuPath: MenuPath, menu: Menu): void {
        const commandId = this.createSyntheticCommandId(menu, { prefix: '__plugin.view.title.action.' });
        const command: Command = { id: commandId };
        this.commands.registerCommand(command, {
            execute: () => this.commands.executeCommand(menu.command),
            isEnabled: () => this.commands.isEnabled(menu.command),
            isVisible: () => this.commands.isVisible(menu.command)
        });

        const { when } = menu;
        const [group = 'navigation', order = undefined] = (menu.group || '').split('@');
        const action: MenuAction = { commandId, order, when };
        this.menuRegistry.registerMenuAction([...menuPath, group], action);

        this.onDidRegisterCommand(menu.command, pluginCommand => {
            command.category = pluginCommand.category;
            action.label = pluginCommand.label;
            if (group === 'navigation') {
                action.icon = pluginCommand.iconClass;
            }
        });
    }

    protected createSyntheticCommandId(menu: Menu, { prefix }: { prefix: string }): string {
        const command = menu.command;
        let id = prefix + command;
        let index = 0;
        while (this.commands.getCommand(id)) {
            id = prefix + command + ':' + index;
            index++;
        }
        return id;
    }

    protected onDidRegisterCommand(id: string, cb: (command: Command) => void): void {
        const command = this.commands.getCommand(id);
        if (command) {
            cb(command);
        } else {
            // Registering a menu action requires the related command to be already registered.
            // But Theia plugin registers the commands dynamically via the Commands API.
            // Let's wait for ~2 sec. It should be enough to finish registering all the contributed commands.
            // FIXME: remove this workaround (timer) once the https://github.com/theia-ide/theia/issues/3344 is fixed
            setTimeout(() => this.onDidRegisterCommand(id, cb), 2000);
        }
    }

}
