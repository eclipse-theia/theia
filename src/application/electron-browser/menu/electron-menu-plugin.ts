/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as electron from 'electron';
import { inject, injectable } from 'inversify';
import {
    isOSX, CommandRegistry,
    ActionMenuNode, CompositeMenuNode, MAIN_MENU_BAR, MenuModelRegistry
} from '../../common';
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

    protected fillMenuTemplate(items: Electron.MenuItemOptions[], menuModel: CompositeMenuNode): Electron.MenuItemOptions[] {
        for (let menu of menuModel.children) {
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
                    })
                    // followed by the elements
                    this.fillMenuTemplate(items, menu);
                }
            } else if (menu instanceof ActionMenuNode) {
                const command = this.commandRegistry.getCommand(menu.action.commandId);
                if (!command) {
                    throw new Error(`Unknown command id: ${menu.action.commandId}.`);
                }
                const handler = this.commandRegistry.getActiveHandler(command.id) || {
                    execute: () => { },
                    isEnabled: () => { return false; },
                    isVisible: () => { return true; }
                };
                let enabled = true;
                if (handler.isEnabled) {
                    enabled = handler.isEnabled();
                }
                let visible = true;
                if (handler.isVisible) {
                    visible = handler.isVisible();
                }
                if (command) {
                    items.push({
                        label: menu.label,
                        icon: menu.icon,
                        enabled: enabled,
                        visible: visible,
                        click: () => handler.execute()
                    });
                }
            }
        }
        return items;
    }

    protected createOSXMenu(): Electron.MenuItemOptions {
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
