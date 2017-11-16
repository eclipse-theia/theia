/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { SearchWorkSpaceService } from './search-workspace';
import {
    MenuContribution, CommandRegistry, CommandContribution, Key, Modifier, KeyCode,
    KeybindingRegistry, KeybindingContribution, Command, MenuModelRegistry
} from '@theia/core/lib/common';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';

export const SearchWorkSpaceCommands: Command = {
    id: 'searchworkspace:open',
    label: 'Search Workspace'
}

@injectable()
export class SearchWorkSpaceFrontendContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    constructor( @inject(SearchWorkSpaceService) protected readonly searchWorkSpaceService: SearchWorkSpaceService,
        @inject(WidgetManager) protected readonly widgetFactory: WidgetManager) {
        console.log("inside SearchWorkSpaceFrontendContribution ctor !!!!");
    }

    registerKeyBindings(keybindings: KeybindingRegistry): void {

        keybindings.registerKeyBinding({
            commandId: SearchWorkSpaceCommands.id,
            keyCode: KeyCode.createKeyCode({ first: Key.KEY_Y, modifiers: [Modifier.M1, Modifier.M2] })
        });
    }

    registerCommands(commands: CommandRegistry): void {
        console.log("registerCommands ---");
        commands.registerCommand(SearchWorkSpaceCommands, {
            execute: () => this.searchWorkSpaceService.open(),
            isEnabled: () => this.searchWorkSpaceService.isEnabled()
        });
    }

    protected async openView(): Promise<void> {
        console.log("openView ... !");
        this.searchWorkSpaceService.open();
    }

    registerMenus(menus: MenuModelRegistry): void {
    }

}
