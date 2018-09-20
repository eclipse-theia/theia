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

import { inject, injectable } from 'inversify';
import {
    CommandContribution,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry
} from '@theia/core/lib/common';
import { CommonMenus, CommonCommands } from '@theia/core/lib/browser/common-frontend-contribution';
import { KeymapsService } from './keymaps-service';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';

@injectable()
export class KeymapsFrontendContribution implements CommandContribution, KeybindingContribution, MenuContribution {

    @inject(KeymapsService)
    protected readonly keymaps: KeymapsService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CommonCommands.OPEN_KEYMAPS, {
            isEnabled: () => true,
            execute: () => this.keymaps.open()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_SETTINGS_SUBMENU_OPEN, {
            commandId: CommonCommands.OPEN_KEYMAPS.id,
            order: 'a20'
        });
    }

    registerKeybindings(keybidings: KeybindingRegistry): void {
        keybidings.registerKeybinding({
            command: CommonCommands.OPEN_KEYMAPS.id,
            keybinding: 'ctrl+alt+,'
        });
    }

}
