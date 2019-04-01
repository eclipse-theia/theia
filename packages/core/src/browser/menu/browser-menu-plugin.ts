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

import { injectable, inject } from 'inversify';
import { MenuBar as MenuBarWidget, Menu as MenuWidget, Widget } from '@phosphor/widgets';
import { CommandRegistry as PhosphorCommandRegistry } from '@phosphor/commands';
import {
    CommandRegistry, ActionMenuNode, CompositeMenuNode,
    MenuModelRegistry, MAIN_MENU_BAR, MenuPath, ILogger
} from '../../common';
import { KeybindingRegistry } from '../keybinding';
import { FrontendApplicationContribution, FrontendApplication } from '../frontend-application';
import { ContextKeyService } from '../context-key-service';
import { Anchor } from '../context-menu-renderer';

@injectable()
export class BrowserMainMenuFactory {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    constructor(
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
        @inject(KeybindingRegistry) protected readonly keybindingRegistry: KeybindingRegistry,
        @inject(MenuModelRegistry) protected readonly menuProvider: MenuModelRegistry
    ) { }

    createMenuBar(): MenuBarWidget {
        const menuBar = new DynamicMenuBarWidget();
        menuBar.id = 'theia:menubar';
        this.fillMenuBar(menuBar);
        const listener = this.keybindingRegistry.onKeybindingsChanged(() => {
            menuBar.clearMenus();
            this.fillMenuBar(menuBar);
        });
        menuBar.disposed.connect(() => listener.dispose());
        return menuBar;
    }

    protected fillMenuBar(menuBar: MenuBarWidget): void {
        const menuModel = this.menuProvider.getMenu(MAIN_MENU_BAR);
        const phosphorCommands = this.createPhosphorCommands(menuModel);
        // for the main menu we want all items to be visible.
        phosphorCommands.isVisible = () => true;

        for (const menu of menuModel.children) {
            if (menu instanceof CompositeMenuNode) {
                const menuWidget = new DynamicMenuWidget(menu, { commands: phosphorCommands }, this.contextKeyService);
                menuBar.addMenu(menuWidget);
            }
        }
    }

    createContextMenu(path: MenuPath, anchor?: Anchor): MenuWidget {
        const menuModel = this.menuProvider.getMenu(path);
        const phosphorCommands = this.createPhosphorCommands(menuModel, anchor);

        const contextMenu = new DynamicMenuWidget(menuModel, { commands: phosphorCommands }, this.contextKeyService);
        return contextMenu;
    }

    protected createPhosphorCommands(menu: CompositeMenuNode, anchor?: Anchor): PhosphorCommandRegistry {
        const commands = new PhosphorCommandRegistry();
        this.addPhosphorCommands(commands, menu, anchor);
        return commands;
    }

    protected addPhosphorCommands(commands: PhosphorCommandRegistry, menu: CompositeMenuNode, anchor?: Anchor): void {
        for (const child of menu.children) {
            if (child instanceof ActionMenuNode) {
                this.addPhosphorCommand(commands, child, anchor);
            } else if (child instanceof CompositeMenuNode) {
                this.addPhosphorCommands(commands, child, anchor);
            }
        }
    }

    protected addPhosphorCommand(commands: PhosphorCommandRegistry, menu: ActionMenuNode, anchor?: Anchor): void {
        const command = this.commandRegistry.getCommand(menu.action.commandId);
        if (!command) {
            return;
        }
        if (commands.hasCommand(command.id)) {
            // several menu items can be registered for the same command in different contexts
            return;
        }
        const args = anchor ? [anchor] : [];
        commands.addCommand(command.id, {
            execute: () => this.commandRegistry.executeCommand(command.id, ...args),
            label: menu.label,
            icon: menu.icon,
            isEnabled: () => this.commandRegistry.isEnabled(command.id, ...args),
            isVisible: () => this.commandRegistry.isVisible(command.id, ...args),
            isToggled: () => this.commandRegistry.isToggled(command.id)
        });

        const bindings = this.keybindingRegistry.getKeybindingsForCommand(command.id);

        /* Only consider the first keybinding. */
        if (bindings.length > 0) {
            const binding = bindings[0];
            const keys = this.keybindingRegistry.acceleratorFor(binding);
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

    constructor(
        protected menu: CompositeMenuNode,
        protected options: MenuWidget.IOptions,
        protected contextKeyService: ContextKeyService
    ) {
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

    public open(x: number, y: number, options?: MenuWidget.IOpenOptions): void {
        // we want to restore the focus after the menu closes.
        const previouslyActive = window.document.activeElement as HTMLElement;
        const cb = () => {
            previouslyActive.focus();
            this.aboutToClose.disconnect(cb);
        };
        this.aboutToClose.connect(cb);
        super.open(x, y, options);
    }

    private updateSubMenus(
        parent: MenuWidget,
        menu: CompositeMenuNode,
        commands: PhosphorCommandRegistry
    ): void {
        const items = this.buildSubMenus([], menu, commands);
        for (const item of items) {
            parent.addItem(item);
        }
    }

    private buildSubMenus(
        items: MenuWidget.IItemOptions[],
        menu: CompositeMenuNode,
        commands: PhosphorCommandRegistry
    ): MenuWidget.IItemOptions[] {
        for (const item of menu.children) {
            if (item instanceof CompositeMenuNode) {
                if (item.children.length > 0) {
                    // do not render empty nodes

                    if (item.isSubmenu) { // submenu node

                        const submenu = new DynamicMenuWidget(item, this.options, this.contextKeyService);
                        if (submenu.items.length === 0) {
                            continue;
                        }

                        items.push({
                            type: 'submenu',
                            submenu,
                        });

                    } else { // group node

                        const submenu = this.buildSubMenus([], item, commands);
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

            } else if (item instanceof ActionMenuNode) {
                const { when } = item.action;
                if (!(commands.isVisible(item.action.commandId) && (!when || this.contextKeyService.match(when)))) {
                    continue;
                }

                items.push({
                    command: item.action.commandId,
                    type: 'command'
                });
            }
        }
        return items;
    }
}

@injectable()
export class BrowserMenuBarContribution implements FrontendApplicationContribution {

    constructor(
        @inject(BrowserMainMenuFactory) protected readonly factory: BrowserMainMenuFactory
    ) { }

    onStart(app: FrontendApplication): void {
        const logo = this.createLogo();
        app.shell.addWidget(logo, { area: 'top' });
        const menu = this.factory.createMenuBar();
        app.shell.addWidget(menu, { area: 'top' });
    }

    protected createLogo(): Widget {
        const logo = new Widget();
        logo.id = 'theia:icon';
        logo.addClass('theia-icon');
        return logo;
    }
}
