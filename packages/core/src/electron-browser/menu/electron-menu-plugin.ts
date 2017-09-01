/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as electron from 'electron';
import { inject, injectable } from 'inversify';
import { isOSX, CommandRegistry, ActionMenuNode, CompositeMenuNode, MAIN_MENU_BAR, MenuModelRegistry, CommandHandler } from '../../common';
import { FrontendApplication, FrontendApplicationContribution } from '../../browser';

@injectable()
export class ElectronMainMenuFactory {

    constructor(
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
        @inject(MenuModelRegistry) protected readonly menuProvider: MenuModelRegistry
    ) { }

    createMenuBar(): Electron.Menu {
        const menuModel = this.menuProvider.getMenu(MAIN_MENU_BAR);
        const template = this.fillMenuTemplate([], menuModel);
        if (isOSX) {
            template.unshift(this.createOSXMenu());
        }
        return electron.remote.Menu.buildFromTemplate(template);
    }

    createContextMenu(path: string): Electron.Menu {
        const menuModel = this.menuProvider.getMenu(path);
        const template = this.fillMenuTemplate([], menuModel);

        return electron.remote.Menu.buildFromTemplate(template);
    }

    protected fillMenuTemplate(items: Electron.MenuItemConstructorOptions[], menuModel: CompositeMenuNode): Electron.MenuItemConstructorOptions[] {
        for (const menu of menuModel.children) {
            if (menu instanceof CompositeMenuNode) {
                if (menu.label) {
                    // should we create a submenu?
                    items.push({
                        label: menu.label,
                        submenu: this.fillMenuTemplate([], menu)
                    });
                } else {
                    // or just a separator?
                    items.push({
                        type: 'separator'
                    });
                    // followed by the elements
                    this.fillMenuTemplate(items, menu);
                }
            } else if (menu instanceof ActionMenuNode) {
                // That is only a sanity check at application startup.
                if (!this.commandRegistry.getCommand(menu.action.commandId)) {
                    throw new Error(`Unknown command with ID: ${menu.action.commandId}.`);
                }
                items.push({
                    label: menu.label,
                    icon: menu.icon,
                    enabled: true, // https://github.com/theia-ide/theia/issues/446
                    visible: true,
                    click: () => this.onClick(menu.action.commandId)
                });
            }
        }
        return items;
    }

    protected findHandler(commandId: string): CommandHandler | undefined {
        const command = this.commandRegistry.getCommand(commandId);
        return command ? this.commandRegistry.getActiveHandler(command!.id) : undefined;
    }

    protected onClick(commandId: string): void {
        const handler = this.findHandler(commandId);
        if (handler) {
            handler.execute();
        }
    }

    protected createOSXMenu(): Electron.MenuItemConstructorOptions {
        return {
            label: 'Theia',
            submenu: [
                {
                    role: 'about'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'services',
                    submenu: []
                },
                {
                    type: 'separator'
                },
                {
                    role: 'hide'
                },
                {
                    role: 'hideothers'
                },
                {
                    role: 'unhide'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'quit'
                }
            ]
        };
    }

}

@injectable()
export class ElectronMenuContribution implements FrontendApplicationContribution {

    constructor(
        @inject(ElectronMainMenuFactory) protected readonly factory: ElectronMainMenuFactory
    ) { }

    onStart(app: FrontendApplication): void {
        const itr = app.shell.children();
        let child = itr.next();
        while (child) {
            // Top panel for the menu contribution is not required for Electron.
            // TODO: Make sure this is the case on Windows too.
            if (child.id === 'theia-top-panel') {
                child.setHidden(true);
                child = undefined;
            } else {
                child = itr.next();
            }
        }
        electron.remote.Menu.setApplicationMenu(this.factory.createMenuBar());
    }

}
