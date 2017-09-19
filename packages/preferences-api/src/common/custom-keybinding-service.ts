/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection, CommandRegistry, KeybindingRegistry, ILogger } from '@theia/core/lib/common';
import { RawKeybinding, KeybindingServer } from './keybindings-protocol';
import * as Ajv from "ajv";

export {
    RawKeybinding
};

export const keybindingSchema = {
    // "type": "array",
    // "items": {
    "type": "object",
    "properties": {
        "keybinding": {
            "type": "string"
        },
        "command": {
            "type": "string"
        },
        "args": {
            "type": "array"
        },
        "context": {
            "type": "string"
        },
    },
    "required": ["command", "keybinding"],
    "optional": [
        "args",
        "context"
    ],
    "additionalProperties": false
    // }
};

@injectable()
export class CustomKeybindingService implements Disposable, FrontendApplicationContribution {

    protected readonly toDispose = new DisposableCollection();
    protected readonly ajv = new Ajv();
    protected ready = false;

    protected resolveReady: () => void;

    constructor(
        @inject(KeybindingServer) protected readonly server: KeybindingServer,
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
        @inject(KeybindingRegistry) protected readonly keyBindingRegistry: KeybindingRegistry,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        server.setClient({
            onDidChangeKeymap: event => this.onDidChangeKeymap(event)
        });
        this.toDispose.push(server);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    onStart(app: FrontendApplication): void {
        this.ready = true;
    }

    protected onDidChangeKeymap(rawKeyBindings: RawKeybinding[]): void {

        // for (const rawKeyBinding of rawKeyBindings) {
        //     if (this.ajv.validate(keybindingSchema, rawKeyBinding)) {
        //         if (!this.keyBindingRegistry.setKeymap(rawKeyBinding)) {
        //             this.logger.warn("Invalid custom keymap:", rawKeyBinding);
        //         }
        //     }
        // }

        if (this.ajv.validate(keybindingSchema, rawKeyBindings)) {
            if (this.ready) {
                this.keyBindingRegistry.setKeymap(rawKeyBindings);
            }
        }

    }
}
