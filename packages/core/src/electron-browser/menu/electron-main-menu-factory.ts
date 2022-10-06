// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as electronRemote from '../../../electron-shared/@electron/remote';
import { inject, injectable, postConstruct } from 'inversify';
import { isOSX, MAIN_MENU_BAR, MenuPath, MenuNode, CommandMenuNode, CompoundMenuNode, CompoundMenuNodeRole } from '../../common';
import { Keybinding } from '../../common/keybinding';
import { PreferenceService, CommonCommands } from '../../browser';
import debounce = require('lodash.debounce');
import { MAXIMIZED_CLASS } from '../../browser/shell/theia-dock-panel';
import { BrowserMainMenuFactory } from '../../browser/menu/browser-menu-plugin';
import { ContextMatcher } from 'src/browser/context-key-service';

/**
 * Representation of possible electron menu options.
 */
export interface ElectronMenuOptions {
    /**
     * Controls whether to render disabled menu items.
     * Defaults to `true`.
     */
    readonly showDisabled?: boolean;
    /**
     * A DOM context to use when evaluating any `when` clauses
     * of menu items registered for this item.
     */
    context?: HTMLElement;
    /**
     * A context key service to use when evaluating any `when` clauses.
     * If none is provided, the global context will be used.
     */
    contextKeyService?: ContextMatcher;
    /**
     * The root menu path for which the menu is being built.
     */
    rootMenuPath: MenuPath
}

/**
 * Define the action of the menu item, when specified the `click` property will
 * be ignored. See [roles](https://www.electronjs.org/docs/api/menu-item#roles).
 */
export type ElectronMenuItemRole = ('undo' | 'redo' | 'cut' | 'copy' | 'paste' |
    'pasteAndMatchStyle' | 'delete' | 'selectAll' | 'reload' | 'forceReload' |
    'toggleDevTools' | 'resetZoom' | 'zoomIn' | 'zoomOut' | 'togglefullscreen' |
    'window' | 'minimize' | 'close' | 'help' | 'about' |
    'services' | 'hide' | 'hideOthers' | 'unhide' | 'quit' |
    'startSpeaking' | 'stopSpeaking' | 'zoom' | 'front' | 'appMenu' |
    'fileMenu' | 'editMenu' | 'viewMenu' | 'recentDocuments' | 'toggleTabBar' |
    'selectNextTab' | 'selectPreviousTab' | 'mergeAllWindows' | 'clearRecentDocuments' |
    'moveTabToNewWindow' | 'windowMenu');

@injectable()
export class ElectronMainMenuFactory extends BrowserMainMenuFactory {

    protected _menu?: Electron.Menu;
    protected _toggledCommands: Set<string> = new Set();

    @inject(PreferenceService)
    protected preferencesService: PreferenceService;

    @postConstruct()
    postConstruct(): void {
        this.preferencesService.onPreferenceChanged(
            debounce(e => {
                if (e.preferenceName === 'window.menuBarVisibility') {
                    this.setMenuBar();
                }
                if (this._menu) {
                    for (const item of this._toggledCommands) {
                        const menuItem = this._menu.getMenuItemById(item);
                        if (menuItem) {
                            menuItem.checked = this.commandRegistry.isToggled(item);
                        }
                    }
                    electronRemote.getCurrentWindow().setMenu(this._menu);
                }
            }, 10)
        );
        this.keybindingRegistry.onKeybindingsChanged(() => {
            this.setMenuBar();
        });
    }

    async setMenuBar(): Promise<void> {
        await this.preferencesService.ready;
        if (isOSX) {
            const createdMenuBar = this.createElectronMenuBar();
            electronRemote.Menu.setApplicationMenu(createdMenuBar);
        } else if (this.preferencesService.get('window.titleBarStyle') === 'native') {
            const createdMenuBar = this.createElectronMenuBar();
            electronRemote.getCurrentWindow().setMenu(createdMenuBar);
        }
    }

    createElectronMenuBar(): Electron.Menu | null {
        const preference = this.preferencesService.get<string>('window.menuBarVisibility') || 'classic';
        const maxWidget = document.getElementsByClassName(MAXIMIZED_CLASS);
        if (preference === 'visible' || (preference === 'classic' && maxWidget.length === 0)) {
            const menuModel = this.menuProvider.getMenu(MAIN_MENU_BAR);
            const template = this.fillMenuTemplate([], menuModel, [], { rootMenuPath: MAIN_MENU_BAR });
            if (isOSX) {
                template.unshift(this.createOSXMenu());
            }
            const menu = electronRemote.Menu.buildFromTemplate(template);
            if (!menu) {
                throw new Error('menu is null');
            }
            this._menu = menu;
            return this._menu;
        }
        this._menu = undefined;
        // eslint-disable-next-line no-null/no-null
        return null;
    }

    createElectronContextMenu(menuPath: MenuPath, args?: any[], context?: HTMLElement, contextKeyService?: ContextMatcher): Electron.Menu {
        const menuModel = this.menuProvider.getMenu(menuPath);
        const template = this.fillMenuTemplate([], menuModel, args, { showDisabled: false, context, rootMenuPath: menuPath, contextKeyService });
        return electronRemote.Menu.buildFromTemplate(template);
    }

    protected fillMenuTemplate(parentItems: Electron.MenuItemConstructorOptions[],
        menu: MenuNode,
        args: unknown[] = [],
        options: ElectronMenuOptions
    ): Electron.MenuItemConstructorOptions[] {
        const showDisabled = options?.showDisabled !== false;

        if (CompoundMenuNode.is(menu) && menu.children.length && this.undefinedOrMatch(options.contextKeyService ?? this.contextKeyService, menu.when, options.context)) {
            const role = CompoundMenuNode.getRole(menu);
            if (role === CompoundMenuNodeRole.Group && menu.id === 'inline') { return parentItems; }
            const children = CompoundMenuNode.getFlatChildren(menu.children);
            const myItems: Electron.MenuItemConstructorOptions[] = [];
            children.forEach(child => this.fillMenuTemplate(myItems, child, args, options));
            if (myItems.length === 0) { return parentItems; }
            if (role === CompoundMenuNodeRole.Submenu) {
                parentItems.push({ label: menu.label, submenu: myItems });
            } else if (role === CompoundMenuNodeRole.Group && menu.id !== 'inline') {
                if (parentItems.length && parentItems[parentItems.length - 1].type !== 'separator') {
                    parentItems.push({ type: 'separator' });
                }
                parentItems.push(...myItems);
                parentItems.push({ type: 'separator' });
            }
        } else if (menu.command) {
            const node = menu.altNode && this.context.altPressed ? menu.altNode : (menu as MenuNode & CommandMenuNode);
            const commandId = node.command;

            // That is only a sanity check at application startup.
            if (!this.commandRegistry.getCommand(commandId)) {
                console.debug(`Skipping menu item with missing command: "${commandId}".`);
                return parentItems;
            }

            if (
                !this.menuCommandExecutor.isVisible(options.rootMenuPath, commandId, ...args)
                || !this.undefinedOrMatch(options.contextKeyService ?? this.contextKeyService, node.when, options.context)) {
                return parentItems;
            }

            // We should omit rendering context-menu items which are disabled.
            if (!showDisabled && !this.menuCommandExecutor.isEnabled(options.rootMenuPath, commandId, ...args)) {
                return parentItems;
            }

            const bindings = this.keybindingRegistry.getKeybindingsForCommand(commandId);

            const accelerator = bindings[0] && this.acceleratorFor(bindings[0]);

            const menuItem: Electron.MenuItemConstructorOptions = {
                id: node.id,
                label: node.label,
                type: this.commandRegistry.getToggledHandler(commandId, ...args) ? 'checkbox' : 'normal',
                checked: this.commandRegistry.isToggled(commandId, ...args),
                enabled: true, // https://github.com/eclipse-theia/theia/issues/446
                visible: true,
                accelerator,
                click: () => this.execute(commandId, args, options.rootMenuPath)
            };

            if (isOSX) {
                const role = this.roleFor(node.id);
                if (role) {
                    menuItem.role = role;
                    delete menuItem.click;
                }
            }
            parentItems.push(menuItem);

            if (this.commandRegistry.getToggledHandler(commandId, ...args)) {
                this._toggledCommands.add(commandId);
            }
        }
        return parentItems;
    }

    protected undefinedOrMatch(contextKeyService: ContextMatcher, expression?: string, context?: HTMLElement): boolean {
        if (expression) {
            return contextKeyService.match(expression, context);
        }
        return true;
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
        // https://github.com/eclipse-theia/theia/issues/1199#issuecomment-430909480
        if (bindingKeySequence.length > 1) {
            return '';
        }

        const keyCode = bindingKeySequence[0];
        return this.keybindingRegistry.acceleratorForKeyCode(keyCode, '+', true);
    }

    protected roleFor(id: string): ElectronMenuItemRole | undefined {
        let role: ElectronMenuItemRole | undefined;
        switch (id) {
            case CommonCommands.UNDO.id:
                role = 'undo';
                break;
            case CommonCommands.REDO.id:
                role = 'redo';
                break;
            case CommonCommands.CUT.id:
                role = 'cut';
                break;
            case CommonCommands.COPY.id:
                role = 'copy';
                break;
            case CommonCommands.PASTE.id:
                role = 'paste';
                break;
            case CommonCommands.SELECT_ALL.id:
                role = 'selectAll';
                break;
            default:
                break;
        }
        return role;
    }

    protected async execute(command: string, args: any[], menuPath: MenuPath): Promise<void> {
        try {
            // This is workaround for https://github.com/eclipse-theia/theia/issues/446.
            // Electron menus do not update based on the `isEnabled`, `isVisible` property of the command.
            // We need to check if we can execute it.
            if (this.menuCommandExecutor.isEnabled(menuPath, command, ...args)) {
                await this.menuCommandExecutor.executeCommand(menuPath, command, ...args);
                if (this._menu && this.menuCommandExecutor.isVisible(menuPath, command, ...args)) {
                    const item = this._menu.getMenuItemById(command);
                    if (item) {
                        item.checked = this.menuCommandExecutor.isToggled(menuPath, command, ...args);
                        electronRemote.getCurrentWindow().setMenu(this._menu);
                    }
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
                    role: 'hideOthers'
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
