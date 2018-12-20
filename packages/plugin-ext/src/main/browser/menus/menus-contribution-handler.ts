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
import { EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser';
import { MenuModelRegistry } from '@theia/core/lib/common';
import { NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-contribution';
import { VIEW_ITEM_CONTEXT_MENU } from '../view/tree-views-main';
import { PluginContribution, Menu } from '../../../common';
import { ContextKeyService, ContextKeyExpr } from '../context-key/context-key';
import { CommandHandler } from '@theia/core';

@injectable()
export class MenusContributionPointHandler {

    @inject(MenuModelRegistry)
    protected readonly menuRegistry: MenuModelRegistry;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    // menu location to command IDs
    protected readonly registeredMenus: Map<string, Set<string>> = new Map();

    /**
     * Handles the `menus` contribution point.
     * In VSCode, a menu can have more than one item for the same command. Each item may have it's own visibility rules.
     * In Theia, a menu can't have more than one item for the same command.
     * So, several handlers for the same command are registered to support different visibility rules for a menu item in different contexts.
     */
    handle(contributions: PluginContribution): void {
        const allMenus = contributions.menus;
        if (!allMenus) {
            return;
        }
        for (const location in allMenus) {
            if (allMenus.hasOwnProperty(location)) {
                const menuPath = MenusContributionPointHandler.parseMenuPath(location);
                if (!menuPath) {
                    this.logger.warn(`Plugin contributes items to a menu with invalid identifier: ${location}`);
                    continue;
                }
                const menus = allMenus[location];
                menus.forEach(menu => {
                    if (!this.isMenuItemRegistered(location, menu.command)) {
                        this.registerMenuAction(menuPath, location, menu);
                    }
                });
                menus.filter(menu => menu.when).forEach(menu => this.registerCommandHandler(menu));
            }
        }
    }

    protected static parseMenuPath(value: string): MenuPath | undefined {
        switch (value) {
            case 'editor/context': return EDITOR_CONTEXT_MENU;
            case 'explorer/context': return NAVIGATOR_CONTEXT_MENU;
            case 'view/item/context': return VIEW_ITEM_CONTEXT_MENU;
        }
    }

    protected isMenuItemRegistered(location: string, commandId: string): boolean {
        const commands = this.registeredMenus.get(location);
        return commands !== undefined && commands.has(commandId);
    }

    protected registerMenuAction(menuPath: MenuPath, location: string, menu: Menu): void {
        const [group = '', order = undefined] = (menu.group || '').split('@');
        // Registering a menu action requires the related command to be already registered.
        // But Theia plugin registers the commands dynamically via the Commands API.
        // Let's wait for ~2 sec. It should be enough to finish registering all the contributed commands.
        // FIXME: remove this workaround (timer) once the https://github.com/theia-ide/theia/issues/3344 is fixed
        setTimeout(() => {
            this.menuRegistry.registerMenuAction([...menuPath, group], {
                commandId: menu.command,
                order
            });
        }, 2000);

        let commands = this.registeredMenus.get(location);
        if (!commands) {
            commands = new Set();
        }
        commands.add(menu.command);
        this.registeredMenus.set(location, commands);
    }

    /** Register a handler for the command that should be called by the specified menu item. */
    protected registerCommandHandler(menu: Menu): void {
        this.commands.registerHandler(menu.command, this.newHandler(menu));
    }

    /**
     * Creates a command handler that executes nothing but allows
     * a related menu item be visible depending on the provided rules.
     */
    protected newHandler(menu: Menu): CommandHandler {
        return {
            execute: () => undefined,
            isEnabled: () => false,
            isVisible: () => this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(menu.when))
        };
    }
}
