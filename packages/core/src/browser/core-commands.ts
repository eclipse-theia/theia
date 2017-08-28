/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import {
    KeybindingContribution, KeybindingRegistry
} from '../common/keybinding';
import { KeyCode, Key, Modifier } from '../common/keys';
import { CommandContribution, CommandRegistry } from '../common/command';
import { Command } from '../common/command';
import { injectable, inject } from 'inversify';
import { FrontendApplication } from '../browser/frontend-application'

export namespace CoreCommands {
    export const TAB_NEXT: Command = {
        id: 'tab:next',
        label: 'Switch to next tab'
    }
    export const TAB_PREVIOUS: Command = {
        id: 'tab:previous',
        label: 'Switch to previous tab'
    }
}

@injectable()
export class CoreContribution implements KeybindingContribution, CommandContribution {

    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(CoreCommands.TAB_NEXT, {
            isEnabled: () => true,
            execute: () => this.app.shell.activateNextTab()
        });

        commands.registerCommand(CoreCommands.TAB_PREVIOUS, {
            isEnabled: () => true,
            execute: () => this.app.shell.activatePreviousTab()
        });
    }

    registerKeyBindings(registry: KeybindingRegistry): void {
        [
            {
                commandId: CoreCommands.TAB_NEXT.id,
                keyCode: KeyCode.createKeyCode({ first: Key.TAB, modifiers: [Modifier.M1] })
            },
            {
                commandId: CoreCommands.TAB_PREVIOUS.id,
                keyCode: KeyCode.createKeyCode({ first: Key.TAB, modifiers: [Modifier.M1, Modifier.M2] })
            },
        ].forEach(binding => {
            registry.registerKeyBinding(binding);
        })
    }
}