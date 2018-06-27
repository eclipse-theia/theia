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
    Command,
    CommandRegistry,
    MenuContribution,
    MenuModelRegistry
} from '@theia/core/lib/common';
import { open, OpenerService } from '@theia/core/lib/browser';
import { FrontendApplication } from '@theia/core/lib/browser';
import { CommonMenus } from "@theia/core/lib/browser/common-frontend-contribution";
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { keymapsUri } from './keymaps-service';
export namespace KeymapsCommands {
    export const OPEN_KEYMAPS: Command = {
        id: 'keymaps:open',
        label: 'Open Keyboard Shortcuts'
    };
}

@injectable()
export class KeymapsFrontendContribution implements CommandContribution, MenuContribution {

    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(OpenerService) protected readonly openerService: OpenerService,
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(KeymapsCommands.OPEN_KEYMAPS, {
            isEnabled: () => true,
            execute: () => this.openKeymapsFile()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(CommonMenus.FILE_OPEN, {
            commandId: KeymapsCommands.OPEN_KEYMAPS.id
        });
    }

    protected openKeymapsFile(): void {
        open(this.openerService, keymapsUri);
    }
}
