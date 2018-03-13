/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { QuickCommandService } from './quick-command-service';
import { Command, CommandRegistry, CommandContribution } from '../../common';
import { KeybindingRegistry, KeybindingContribution } from "../keybinding";

export const quickCommand: Command = {
    id: 'quickCommand',
    label: 'Open Quick Command'
};

@injectable()
export class QuickCommandFrontendContribution implements CommandContribution, KeybindingContribution {

    @inject(QuickCommandService)
    protected readonly quickCommandService: QuickCommandService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(quickCommand, {
            execute: () => this.quickCommandService.open()
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: quickCommand.id,
            keybinding: "f1"
        });
        keybindings.registerKeybinding({
            command: quickCommand.id,
            keybinding: "ctrlcmd+shift+p"
        });
    }

}
