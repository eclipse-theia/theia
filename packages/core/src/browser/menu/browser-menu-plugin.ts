/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { MenuBar as MenuBarWidget, Menu as MenuWidget, Widget } from "@phosphor/widgets";
import { CommandRegistry as PhosphorCommandRegistry } from "@phosphor/commands";
import { CommandRegistry, KeybindingRegistry, ActionMenuNode, CompositeMenuNode, MenuModelRegistry, MAIN_MENU_BAR } from "../../common";
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
        for (const menu of menuModel.children) {
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

    protected createPhosporCommands(menu: CompositeMenuNode): PhosphorCommandRegistry {
        const commands = new PhosphorCommandRegistry();
        this.addPhosphorCommands(commands, menu);
        return commands;
    }

    protected addPhosphorCommands(commands: PhosphorCommandRegistry, menu: CompositeMenuNode): void {
        for (const child of menu.children) {
            if (child instanceof ActionMenuNode) {
                this.addPhosphorCommand(commands, child);
            } else if (child instanceof CompositeMenuNode) {
                this.addPhosphorCommands(commands, child);
            }
        }
    }

    protected addPhosphorCommand(commands: PhosphorCommandRegistry, menu: ActionMenuNode): void {
        const command = this.commandRegistry.getCommand(menu.action.commandId);
        if (!command) {
            return;
        }
        commands.addCommand(command.id, {
            execute: () => this.commandRegistry.executeCommand(command.id),
            label: menu.label,
            icon: command.iconClass,
            isEnabled: () => this.commandRegistry.isEnabled(command.id),
            isVisible: () => this.commandRegistry.isVisible(command.id)
        });

        const binding = this.keybindingRegistry.getKeybindingForCommand(command.id, { active: false });
        if (binding) {
            const keys = binding.accelerator || [];
            commands.addKeyBinding({
                command: command.id,
                keys,
                selector: '.p-Widget' // We have the Phosphor.JS dependency anyway.
            });
        }
    }


}
class DynamicMenuBarWidget extends MenuBarWidget {

    constructor() {
        super();
        // HACK we need to hook in on private method _openChildMenu. Don't do this at home!
        DynamicMenuBarWidget.prototype['_openChildMenu'] = () => {
            if (this.activeMenu instanceof DynamicMenuWidget) {
                this.activeMenu.aboutToShow();
            }
            super['_openChildMenu']();
        };
    }
}
/**
 * A menu widget that would recompute its items on update
 */
class DynamicMenuWidget extends MenuWidget {

    constructor(protected menu: CompositeMenuNode, protected options: MenuWidget.IOptions) {
        super(options);
        if (menu.label) {
            this.title.label = menu.label;
        }
        this.updateSubMenus(this, this.menu, this.options.commands);
    }

    public aboutToShow(): void {
        this.clearItems();
        this.updateSubMenus(this, this.menu, this.options.commands);
    }

    private updateSubMenus(parent: MenuWidget, menu: CompositeMenuNode, commands: PhosphorCommandRegistry): void {
        for (const item of menu.children) {
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
