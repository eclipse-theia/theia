/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as Ajv from 'ajv';
import * as jsoncparser from 'jsonc-parser';
import { inject, injectable, postConstruct } from 'inversify';
import { ResourceProvider, Resource, MessageService } from '@theia/core/lib/common';
import { KeybindingRegistry, KeybindingScope, OpenerService, open, Keybinding } from '@theia/core/lib/browser';
import { UserStorageUri } from '@theia/userstorage/lib/browser';
import URI from '@theia/core/lib/common/uri';

export const keymapsSchema = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            keybinding: {
                type: 'string'
            },
            command: {
                type: 'string'
            },
            context: {
                type: 'string'
            },
        },
        required: ['command', 'keybinding'],
        optional: ['context'],
        additionalProperties: false,
    }
};

@injectable()
export class KeymapsService {

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @inject(KeybindingRegistry)
    protected readonly keyBindingRegistry: KeybindingRegistry;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(OpenerService)
    protected readonly opener: OpenerService;

    protected resource: Resource;

    protected readonly validate: Ajv.ValidateFunction;

    constructor() {
        // https://github.com/epoberezkin/ajv#options
        this.validate = new Ajv({
            jsonPointers: true
        }).compile(keymapsSchema);
    }

    @postConstruct()
    protected async init() {
        this.resource = await this.resourceProvider(new URI('keymaps.json').withScheme(UserStorageUri.SCHEME));
        this.reconcile();
        if (this.resource.onDidChangeContents) {
            this.resource.onDidChangeContents(() => this.reconcile());
        }
    }

    protected async reconcile(): Promise<void> {
        const keybindings = await this.parseKeybindings();
        this.keyBindingRegistry.setKeymap(KeybindingScope.USER, keybindings);
    }

    protected async parseKeybindings(): Promise<Keybinding[]> {
        try {
            const content = await this.resource.readContents();
            const strippedContent = jsoncparser.stripComments(content);
            const bindings = jsoncparser.parse(strippedContent);
            if (this.validate(bindings)) {
                return bindings;
            }
            return [];
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    open(): void {
        open(this.opener, this.resource.uri);
    }

}
