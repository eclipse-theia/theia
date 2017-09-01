/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify"
import { KeybindingContribution, KeybindingRegistry, KeyCode, Key, Modifier } from "../../common"

@injectable()
export class ElectronKeybindingContribution implements KeybindingContribution {

    registerKeyBindings(registry: KeybindingRegistry): void {
        [
            {
                commandId: 'theia.electron.toggle.dev.tools',
                keyCode: KeyCode.createKeyCode({ first: Key.KEY_I, modifiers: [Modifier.M1, Modifier.M2] })
            }
        ].forEach(binding => {
            registry.registerKeyBinding(binding);
        });
    }
}
