/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { Command, CommandContribution, CommandRegistry, Key, KeyCode, KeybindingContribution, KeybindingRegistry } from '@theia/core';
import { MonacoQuickCommandService } from './monaco-quick-command-service';

export const quickCommand: Command = {
    id: 'core.quickCommand',
    label: 'Quick Command'
};

@injectable()
export class MonacoQuickCommandFrontendContribution implements CommandContribution, KeybindingContribution {

    @inject(MonacoQuickCommandService)
    protected readonly quickCommnadService: MonacoQuickCommandService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(quickCommand, {
            execute: () => this.quickCommnadService.show()
        });
    }

    registerKeyBindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeyBinding({
            commandId: quickCommand.id,
            keyCode: KeyCode.createKeyCode({ first: Key.F1 })
        });
    }

}
