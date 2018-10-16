/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as electron from 'electron';
import { inject, injectable } from 'inversify';
import {
    CommandRegistry, isOSX, ActionMenuNode, CompositeMenuNode,
    MAIN_MENU_BAR, MenuModelRegistry, MenuPath
} from '../../common';
import { PreferenceService, KeybindingRegistry, Keybinding, KeyCode, Key } from '../../browser';

@injectable()
export class ElectronMainMenuFactory {

    protected _menu: Electron.Menu;
    protected _toggledCommands: Set<string> = new Set();

    constructor(
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
        @inject(PreferenceService) protected readonly preferencesService: PreferenceService,
        @inject(MenuModelRegistry) protected readonly menuProvider: MenuModelRegistry,
        @inject(KeybindingRegistry) protected readonly keybindingRegistry: KeybindingRegistry
    ) {
        this.preferencesService.onPreferenceChanged(() => {
            for (const item of this._toggledCommands) {
                this._menu.getMenuItemById(item).checked = this.commandRegistry.isToggled(item);
                electron.remote.getCurrentWindow().setMenu(this._menu);
            }
        });
    }

    createMenuBar(): Electron.Menu {
        const menuModel = this.menuProvider.getMenu(MAIN_MENU_BAR);
        const template = this.fillMenuTemplate([], menuModel);
        if (isOSX) {
            template.unshift(this.createOSXMenu());
        }
        const menu = electron.remote.Menu.buildFromTemplate(template);
        this._menu = menu;
        return menu;
    }

    createContextMenu(menuPath: MenuPath): Electron.Menu {
        const menuModel = this.menuProvider.getMenu(menuPath);
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
                } else if (menu.children.length > 0) {
                    // do not put a separator above the first group
                    if (items.length > 0) {
                        // or just a separator?
                        items.push({
                            type: 'separator'
                        });
                    }
                    // followed by the elements
                    this.fillMenuTemplate(items, menu);
                }
            } else if (menu instanceof ActionMenuNode) {
                const commandId = menu.action.commandId;
                // That is only a sanity check at application startup.
                if (!this.commandRegistry.getCommand(commandId)) {
                    throw new Error(`Unknown command with ID: ${commandId}.`);
                }

                const bindings = this.keybindingRegistry.getKeybindingsForCommand(commandId);

                let accelerator;

                /* Only consider the first keybinding. */
                if (bindings.length > 0) {
                    const binding = bindings[0];
                    accelerator = this.acceleratorFor(binding);
                }

                items.push({
                    id: menu.id,
                    label: menu.label,
                    icon: menu.icon,
                    type: this.commandRegistry.getToggledHandler(commandId) ? 'checkbox' : 'normal',
                    checked: this.commandRegistry.isToggled(commandId),
                    enabled: true, // https://github.com/theia-ide/theia/issues/446
                    visible: true,
                    click: () => this.execute(commandId),
                    accelerator
                });
                if (this.commandRegistry.getToggledHandler(commandId)) {
                    this._toggledCommands.add(commandId);
                }
            }
        }
        return items;
    }

    /**
     * Return a user visible representation of a keybinding.
     */
    protected acceleratorFor(keybinding: Keybinding) {
        const keyCodesString = keybinding.keybinding.split(' ');
        let result = '';
        // FIXME see https://github.com/electron/electron/issues/11740
        // Key Sequences can't be represented properly in the electron menu.
        //
        // We can do what VS Code does, and append the chords as a suffix to the menu label.
        // https://github.com/theia-ide/theia/issues/1199#issuecomment-430909480
        if (keyCodesString.length > 1) {
            return result;
        }

        const keyCodeString = keyCodesString[0];
        const keyCode = KeyCode.parse(keyCodeString);
        let previous = false;
        const separator = '+';

        if (keyCode.meta && isOSX) {
            if (isOSX) {
                result += 'Cmd';
                previous = true;
            }
        }

        if (keyCode.ctrl) {
            if (previous) {
                result += separator;
            }
            result += 'Ctrl';
            previous = true;
        }

        if (keyCode.alt) {
            if (previous) {
                result += separator;
            }
            result += 'Alt';
            previous = true;
        }

        if (keyCode.shift) {
            if (previous) {
                result += separator;
            }
            result += 'Shift';
            previous = true;
        }

        if (keyCode.key) {
            if (previous) {
                result += separator;
            }

            result += Key.getEasyKey(keyCode.key).easyString;
        }

        return result;
    }

    protected async execute(command: string): Promise<void> {
        try {
            // This is workaround for https://github.com/theia-ide/theia/issues/446.
            // Electron menus do not update based on the `isEnabled`, `isVisible` property of the command.
            // We need to check if we can execute it.
            if (this.commandRegistry.isEnabled(command)) {
                await this.commandRegistry.executeCommand(command);
                if (this.commandRegistry.isVisible(command)) {
                    this._menu.getMenuItemById(command).checked = this.commandRegistry.isToggled(command);
                    electron.remote.getCurrentWindow().setMenu(this._menu);
                }
            }
        } catch {
            // no-op
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
