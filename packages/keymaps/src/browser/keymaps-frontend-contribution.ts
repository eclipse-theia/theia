/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
import { FileMenus } from '@theia/workspace/lib/browser/workspace-commands';
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
        menus.registerMenuAction(FileMenus.OPEN_GROUP, {
            commandId: KeymapsCommands.OPEN_KEYMAPS.id
        });
    }

    protected openKeymapsFile(): void {
        open(this.openerService, keymapsUri);
    }
}
