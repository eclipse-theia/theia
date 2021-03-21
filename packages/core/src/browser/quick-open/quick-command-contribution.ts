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
import { Command, CommandRegistry, CommandContribution, MenuContribution, MenuModelRegistry } from '../../common';
import { KeybindingRegistry, KeybindingContribution } from '../keybinding';
import { PrefixQuickOpenService, QuickOpenHandlerRegistry } from './prefix-quick-open-service';
import { CommonMenus } from '../common-frontend-contribution';

export const quickCommand: Command = {
    id: 'workbench.action.showCommands'
};

export const CLEAR_COMMAND_HISTORY: Command = {
    id: 'clear.command.history',
    label: 'Clear Command History'
};

@injectable()
export class QuickCommandFrontendContribution implements CommandContribution, KeybindingContribution, MenuContribution {

    @inject(PrefixQuickOpenService)
    protected readonly quickOpenService: PrefixQuickOpenService;

    @inject(QuickOpenHandlerRegistry) protected readonly quickOpenHandlerRegistry: QuickOpenHandlerRegistry;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(quickCommand, {
            execute: () => this.quickOpenService.open('>')
        });
        commands.registerCommand(CLEAR_COMMAND_HISTORY, {
            execute: () => commands.clearCommandHistory(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.VIEW_PRIMARY, {
            commandId: quickCommand.id,
            label: 'Find Command...'
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: quickCommand.id,
            keybinding: 'f1'
        });
        keybindings.registerKeybinding({
            command: quickCommand.id,
            keybinding: 'ctrlcmd+shift+p'
        });
    }
}
