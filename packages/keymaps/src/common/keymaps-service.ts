/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection, CommandRegistry, KeybindingRegistry, ILogger } from '@theia/core/lib/common';
import { RawKeybinding, KeymapsServer, KeymapChangeEvent } from './keymaps-protocol';
import * as ajv from 'ajv';

export const keymapsSchema = {
    "type": "array",
    "properties": {
        "keybinding": {
            "type": "string"
        },
        "command": {
            "type": "string"
        },
        "context": {
            "type": "string"
        },
    },
    "required": ["command", "keybinding"],
    "optional": [
        "context"
    ],
    "additionalProperties": false
};

export {
    RawKeybinding
};

@injectable()
export class KeymapsService implements Disposable, FrontendApplicationContribution {

    protected readonly toDispose = new DisposableCollection();
    protected readonly ajv = new ajv();
    protected ready = false;
    constructor(
        @inject(KeymapsServer) protected readonly server: KeymapsServer,
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

    protected onDidChangeKeymap(keymapChangeEvent: KeymapChangeEvent): void {
        if (this.ready) {
            const changes = keymapChangeEvent.changes;
            if (this.ajv.validate(keymapsSchema, changes)) {
                this.keyBindingRegistry.setKeymap(keymapChangeEvent.changes);
            }
        }
    }
}
