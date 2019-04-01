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
import { PreferenceService, KeybindingRegistry, Keybinding } from '../../browser';
import { ContextKeyService } from '../../browser/context-key-service';
import { Anchor } from '../../browser/context-menu-renderer';

@injectable()
export class ElectronMainMenuFactory {

    protected _menu: Electron.Menu;
    protected _toggledCommands: Set<string> = new Set();

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    constructor(
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
        @inject(PreferenceService) protected readonly preferencesService: PreferenceService,
        @inject(MenuModelRegistry) protected readonly menuProvider: MenuModelRegistry,
        @inject(KeybindingRegistry) protected readonly keybindingRegistry: KeybindingRegistry
    ) {
        preferencesService.onPreferenceChanged(() => {
            for (const item of this._toggledCommands) {
                this._menu.getMenuItemById(item).checked = this.commandRegistry.isToggled(item);
                electron.remote.getCurrentWindow().setMenu(this._menu);
            }
        });
        keybindingRegistry.onKeybindingsChanged(() => {
            const createdMenuBar = this.createMenuBar();
            if (isOSX) {
                electron.remote.Menu.setApplicationMenu(createdMenuBar);
            } else {
                electron.remote.getCurrentWindow().setMenu(createdMenuBar);
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

    createContextMenu(menuPath: MenuPath, anchor?: Anchor): Electron.Menu {
        const menuModel = this.menuProvider.getMenu(menuPath);
        const template = this.fillMenuTemplate([], menuModel, anchor);

        return electron.remote.Menu.buildFromTemplate(template);
    }

    protected fillMenuTemplate(items: Electron.MenuItemConstructorOptions[],
        menuModel: CompositeMenuNode,
        anchor?: Anchor
    ): Electron.MenuItemConstructorOptions[] {
        for (const menu of menuModel.children) {
            if (menu instanceof CompositeMenuNode) {
                if (menu.children.length > 0) {
                    // do not render empty nodes

                    if (menu.isSubmenu) { // submenu node

                        const submenu = this.fillMenuTemplate([], menu, anchor);
                        if (submenu.length === 0) {
                            continue;
                        }

                        items.push({
                            label: menu.label,
                            submenu
                        });

                    } else { // group node

                        // process children
                        const submenu = this.fillMenuTemplate([], menu, anchor);
                        if (submenu.length === 0) {
                            continue;
                        }

                        if (items.length > 0) {
                            // do not put a separator above the first group

                            items.push({
                                type: 'separator'
                            });
                        }

                        // render children
                        items.push(...submenu);
                    }
                }
            } else if (menu instanceof ActionMenuNode) {
                const commandId = menu.action.commandId;

                // That is only a sanity check at application startup.
                if (!this.commandRegistry.getCommand(commandId)) {
                    throw new Error(`Unknown command with ID: ${commandId}.`);
                }

                const args = anchor ? [anchor] : [];
                if (!this.commandRegistry.isVisible(commandId, ...args)
                    || (!!menu.action.when && !this.contextKeyService.match(menu.action.when))) {
                    continue;
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
                    type: this.commandRegistry.getToggledHandler(commandId) ? 'checkbox' : 'normal',
                    checked: this.commandRegistry.isToggled(commandId),
                    enabled: true, // https://github.com/theia-ide/theia/issues/446
                    visible: true,
                    click: () => this.execute(commandId, anchor),
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
    protected acceleratorFor(keybinding: Keybinding): string {
        const bindingKeySequence = this.keybindingRegistry.resolveKeybinding(keybinding);
        // FIXME see https://github.com/electron/electron/issues/11740
        // Key Sequences can't be represented properly in the electron menu.
        //
        // We can do what VS Code does, and append the chords as a suffix to the menu label.
        // https://github.com/theia-ide/theia/issues/1199#issuecomment-430909480
        if (bindingKeySequence.length > 1) {
            return '';
        }

        const keyCode = bindingKeySequence[0];
        return this.keybindingRegistry.acceleratorForKeyCode(keyCode, '+');
    }

    protected async execute(command: string, anchor?: Anchor): Promise<void> {
        try {
            const args = anchor ? [anchor] : [];
            // This is workaround for https://github.com/theia-ide/theia/issues/446.
            // Electron menus do not update based on the `isEnabled`, `isVisible` property of the command.
            // We need to check if we can execute it.
            if (this.commandRegistry.isEnabled(command, ...args)) {
                await this.commandRegistry.executeCommand(command, ...args);
                if (this.commandRegistry.isVisible(command, ...args)) {
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
