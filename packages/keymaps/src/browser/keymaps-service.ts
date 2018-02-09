/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { FrontendApplicationContribution, FrontendApplication, KeybindingRegistry, Keybinding, KeybindingScope } from '@theia/core/lib/browser';
import { Disposable, DisposableCollection, CommandRegistry, ILogger, ResourceProvider, Resource } from '@theia/core/lib/common';
import { UserStorageUri } from '@theia/userstorage/lib/browser/';
import URI from '@theia/core/lib/common/uri';
import * as ajv from 'ajv';
import * as jsoncparser from "jsonc-parser";
import { ParseError } from "jsonc-parser";

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

export const keymapsUri: URI = new URI('keymaps.json').withScheme(UserStorageUri.SCHEME);

@injectable()
export class KeymapsService implements Disposable, FrontendApplicationContribution {

    protected readonly toDispose = new DisposableCollection();
    protected readonly ajv = new ajv();
    protected ready = false;
    protected keymapsResource: Resource;

    constructor(
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry,
        @inject(KeybindingRegistry) protected readonly keyBindingRegistry: KeybindingRegistry,
        @inject(ILogger) protected readonly logger: ILogger
    ) {
        this.resourceProvider(keymapsUri).then(resource => {
            this.keymapsResource = resource;
            this.toDispose.push(this.keymapsResource);
            if (this.keymapsResource.onDidChangeContents) {
                this.keymapsResource.onDidChangeContents(() => {
                    this.onDidChangeKeymap();
                });
            }

            this.keymapsResource.readContents().then(content => {
                this.parseKeybindings(content);
            });
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
        const strippedContent = jsoncparser.stripComments(content);
        const errors: ParseError[] = [];
        const keybindings = jsoncparser.parse(strippedContent, errors);
        if (errors.length) {
            for (const error of errors) {
                this.logger.error("JSON parsing error", error);
            }
            this.keyBindingRegistry.resetKeybindingsForScope(KeybindingScope.USER);

        }
        if (keybindings) {
            this.setKeymap(keybindings);
        }
    }

    protected setKeymap(keybindings: any) {
        const bindings: Keybinding[] = [];

        for (const keybinding of keybindings) {
            bindings.push({
                command: keybinding.command,
                keybinding: keybinding.keybinding,
                context: keybinding.context
            });
        }

        if (this.ajv.validate(keymapsSchema, bindings)) {
            this.keyBindingRegistry.setKeymap(KeybindingScope.USER, bindings);
        }
    }
}
