/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection, CommandRegistry, KeybindingRegistry, ILogger, ResourceProvider } from '@theia/core/lib/common';
import { RawKeybinding } from '@theia/core/lib/common';
import { UserStorageUri, UserStorageResource } from '@theia/userstorage/lib/browser/';
import URI from '@theia/core/lib/common/uri';
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

export const keymapsUri: URI = UserStorageUri.create('keymaps.json');

@injectable()
export class KeymapsService implements Disposable, FrontendApplicationContribution {

    protected readonly toDispose = new DisposableCollection();
    protected readonly ajv = new ajv();
    protected ready = false;
    protected keymapsResource: UserStorageResource;

    constructor(
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
        @inject(KeybindingRegistry) protected readonly keyBindingRegistry: KeybindingRegistry,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        this.resourceProvider(keymapsUri).then(resource => {
            if (resource !== undefined && resource instanceof UserStorageResource) {
                this.keymapsResource = <UserStorageResource>resource;
                this.toDispose.push(this.keymapsResource);
                this.keymapsResource.onDidChangeContents(() => {
                    this.onDidChangeKeymap();
                });

                this.keymapsResource.readContents().then(content => {
                    this.parseKeybindings(content);
                });

            } else {
                this.logger.error('No resource exists for: ', keymapsUri);
            }
        });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    onStart(app: FrontendApplication): void {
        this.ready = true;
    }

    protected onDidChangeKeymap(): void {

        this.keymapsResource.readContents().then(content => {
            this.parseKeybindings(content);
        });
    }

    protected parseKeybindings(content: string) {
        let keybindings: any;
        try {
            this.keyBindingRegistry.clearKeymaps();
            keybindings = JSON.parse(content);
            if (keybindings) {
                this.setKeymap(keybindings);
            }
        } catch (error) {
            this.logger.error('JSON parsing error: ', error);
        }
    }

    protected setKeymap(keybindings: any | undefined) {
        const rawBindings: RawKeybinding[] = [];

        for (const keybinding of keybindings) {
            rawBindings.push({
                command: keybinding.command,
                keybinding: keybinding.keybinding,
                context: keybinding.context
            });
        }

        if (this.ajv.validate(keymapsSchema, rawBindings)) {
            this.keyBindingRegistry.setKeymap(rawBindings);
        }

    }
}
