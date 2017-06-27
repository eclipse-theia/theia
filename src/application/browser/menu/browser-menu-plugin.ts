/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MenuBar as MenuBarWidget, Menu as MenuWidget, Widget } from "@phosphor/widgets";
import { CommandRegistry as PhosphorCommandRegistry } from "@phosphor/commands";
import {
    CommandRegistry, KeybindingRegistry,
    ActionMenuNode, CompositeMenuNode, MenuModelRegistry, MAIN_MENU_BAR
} from "../../common";
import { FrontendApplicationContribution, FrontendApplication } from "../frontend-application";

@injectable()
export class BrowserMainMenuFactory {

    constructor(
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
        @inject(KeybindingRegistry) protected readonly keybindingRegistry: KeybindingRegistry,
        @inject(MenuModelRegistry) protected readonly menuProvider: MenuModelRegistry
    ) { }

    createMenuBar(): MenuBarWidget {
        const menuBar = new DynamicMenuBarWidget();
        menuBar.id = 'theia:menubar';
        const menuModel = this.menuProvider.getMenu(MAIN_MENU_BAR);
        const phosphorCommands = this.createPhosporCommands(menuModel);
        for (let menu of menuModel.children) {
            if (menu instanceof CompositeMenuNode) {
                const menuWidget = new DynamicMenuWidget(menu, { commands: phosphorCommands });
                menuBar.addMenu(menuWidget);
            }
        }
        return menuBar;
    }

    createContextMenu(path: string): MenuWidget {
        const menuModel = this.menuProvider.getMenu(path);
        const phosphorCommands = this.createPhosporCommands(menuModel);

        const contextMenu = new DynamicMenuWidget(menuModel, { commands: phosphorCommands });
        return contextMenu;
    }

    private createPhosporCommands(menu: CompositeMenuNode): PhosphorCommandRegistry {
        const commands = new PhosphorCommandRegistry();
        const commandRegistry = this.commandRegistry;
        const keybindingRegistry = this.keybindingRegistry;
        function initCommands(current: CompositeMenuNode): void {
            for (let menu of current.children) {
                if (menu instanceof ActionMenuNode) {
                    const command = commandRegistry.getCommand(menu.action.commandId);
                    if (command) {
                        const getHandler = (commandId: string) => {
                            return commandRegistry.getActiveHandler(commandId) || {
                                execute: () => { },
                                isEnabled: () => { return false; },
                                isVisible: () => { return true; }
                            }
                        }
                        commands.addCommand(command.id, {
                            execute: (e: any) => getHandler(command.id).execute(),
                            label: menu.label,
                            icon: command.iconClass,
                            isEnabled: (e: any) => {
                                let handler = getHandler(command.id)
                                return !handler.isEnabled || handler.isEnabled()
                            },
                            isVisible: (e: any) => {
                                let handler = getHandler(command.id)
                                return !handler.isVisible || handler.isVisible()
                            }
                        });

                        const binding = keybindingRegistry.getKeybindingForCommand(command.id);
                        if (binding) {
                            const keys = binding.accelerator || [];
                            commands.addKeyBinding({
                                command: command.id,
                                keys,
                                selector: '.p-Widget' // We have the Phosphor.JS dependency anyway.
                            });
                        }
                    }
                } else if (menu instanceof CompositeMenuNode) {
                    initCommands(menu);
                }
            }
        }
        initCommands(menu);
        return commands;
    }


}
class DynamicMenuBarWidget extends MenuBarWidget {

    constructor() {
        super()
        // HACK we need to hook in on private method _openChildMenu. Don't do this at home!
        DynamicMenuBarWidget.prototype['_openChildMenu'] = () => {
            if (this.activeMenu instanceof DynamicMenuWidget) {
                this.activeMenu.aboutToShow()
            }
            super['_openChildMenu']()
        }
    }
}
/**
 * A menu widget that would recompute its items on update
 */
class DynamicMenuWidget extends MenuWidget {

    constructor(protected menu: CompositeMenuNode, protected options: MenuWidget.IOptions) {
        super(options)
        if (menu.label) {
            this.title.label = menu.label;
        }
        this.updateSubMenus(this, this.menu, this.options.commands)
    }

    public aboutToShow(): void {
        this.clearItems()
        this.updateSubMenus(this, this.menu, this.options.commands)
    }

    private updateSubMenus(parent: MenuWidget, menu: CompositeMenuNode, commands: PhosphorCommandRegistry): void {
        for (let item of menu.children) {
            if (item instanceof CompositeMenuNode) {
                if (item.label) {
                    parent.addItem({
                        type: 'submenu',
                        submenu: new DynamicMenuWidget(item, this.options)
                    });
                } else {
                    if (item.children.length > 0) {
                        if (parent.items.length > 0) {
                            parent.addItem({
                                type: 'separator'
                            });
                        }
                        this.updateSubMenus(parent, item, commands);
                    }
                }
            } else if (item instanceof ActionMenuNode) {
                parent.addItem({
                    command: item.action.commandId,
                    type: 'command'
                });
            }
        }
    }
}

@injectable()
export class BrowserMenuBarContribution implements FrontendApplicationContribution {

    constructor(
        @inject(BrowserMainMenuFactory) protected readonly factory: BrowserMainMenuFactory
    ) { }

    onStart(app: FrontendApplication): void {
        const logo = this.createLogo();
        app.shell.addToTopArea(logo);
        const menu = this.factory.createMenuBar();
        app.shell.addToTopArea(menu);
    }

    protected createLogo(): Widget {
        const logo = new Widget();
        logo.id = 'theia:icon';
        logo.addClass('theia-icon');
        return logo;
    }
}
