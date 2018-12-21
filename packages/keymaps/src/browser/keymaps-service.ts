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

import { inject, injectable, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { ResourceProvider, Resource } from '@theia/core/lib/common';
import { Keybinding, KeybindingRegistry, KeybindingScope, OpenerService, open, WidgetOpenerOptions, Widget } from '@theia/core/lib/browser';
import { UserStorageUri } from '@theia/userstorage/lib/browser';
import { KeymapsParser } from './keymaps-parser';
import * as jsoncparser from 'jsonc-parser';
import { Emitter } from '@theia/core/lib/common/';

export interface KeybindingJson {
    command: string,
    keybinding: string,
    context: string,
}

@injectable()
export class KeymapsService {

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @inject(KeybindingRegistry)
    protected readonly keyBindingRegistry: KeybindingRegistry;

    @inject(OpenerService)
    protected readonly opener: OpenerService;

    @inject(KeymapsParser)
    protected readonly parser: KeymapsParser;

    protected readonly changeKeymapEmitter = new Emitter<void>();
    onDidChangeKeymaps = this.changeKeymapEmitter.event;

    protected resource: Resource;

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
        this.changeKeymapEmitter.fire(undefined);
    }

    protected async parseKeybindings(): Promise<Keybinding[]> {
        try {
            const content = await this.resource.readContents();
            return this.parser.parse(content);
        } catch (error) {
            return error;
        }
    }

    open(ref?: Widget): void {
        const options: WidgetOpenerOptions = {
            widgetOptions: ref ? { area: 'main', mode: 'split-right', ref } : { area: 'main' },
            mode: 'activate'
        };
        open(this.opener, this.resource.uri, options);
    }

    async setKeybinding(keybindingJson: KeybindingJson): Promise<void> {
        if (!this.resource.saveContents) {
            return;
        }
        const content = await this.resource.readContents();
        const keybindings: KeybindingJson[] = content ? jsoncparser.parse(content) : [];
        let updated = false;
        for (let i = 0; i < keybindings.length; i++) {
            if (keybindings[i].command === keybindingJson.command) {
                updated = true;
                keybindings[i].keybinding = keybindingJson.keybinding;
            }
        }
        if (!updated) {
            const item: KeybindingJson = { ...keybindingJson };
            keybindings.push(item);
        }
        await this.resource.saveContents(JSON.stringify(keybindings, undefined, 4));
    }

    async removeKeybinding(commandId: string): Promise<void> {
        if (!this.resource.saveContents) {
            return;
        }
        const content = await this.resource.readContents();
        const keybindings: KeybindingJson[] = content ? jsoncparser.parse(content) : [];
        const filtered = keybindings.filter(a => a.command !== commandId);
        await this.resource.saveContents(JSON.stringify(filtered, undefined, 4));
    }

    async getKeybindings(): Promise<KeybindingJson[]> {
        if (!this.resource.saveContents) {
            return [];
        }
        const content = await this.resource.readContents();
        return content ? jsoncparser.parse(content) : [];
    }

}
