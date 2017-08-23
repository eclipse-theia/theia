/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { KeybindingContext, Keybinding, KeybindingContribution, KeybindingRegistry, KeyCode, Key, Modifier } from "@theia/core/lib/common";

@injectable()
export class GitKeybindingContext implements KeybindingContext {

    id = 'git.keybinding.context';

    isEnabled(arg?: Keybinding) {
        return true;
    }

}

@injectable()
export class GitKeybindingContribution implements KeybindingContribution {

    constructor(
        @inject(GitKeybindingContext) protected readonly keybindingContext: KeybindingContext
    ) { }

    registerKeyBindings(registry: KeybindingRegistry): void {
        [
            {
                commandId: 'git.status',
                context: this.keybindingContext,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_S, modifiers: [Modifier.M2, Modifier.M3] })
            },
            {
                commandId: 'git.repositories',
                context: this.keybindingContext,
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_R, modifiers: [Modifier.M2, Modifier.M3] })
            }
        ].forEach(binding => {
            registry.registerKeyBinding(binding);
        });
    }

}
