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
import { ResourceProvider, Resource, MessageService } from '@theia/core/lib/common';
import { KeybindingRegistry, KeybindingScope, OpenerService, open, Keybinding } from '@theia/core/lib/browser';
import { UserStorageUri } from '@theia/userstorage/lib/browser';
import { KeymapsParser } from './keymaps-parser';

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

    @inject(KeymapsParser)
    protected readonly parser: KeymapsParser;

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
    }

    protected async parseKeybindings(): Promise<Keybinding[]> {
        try {
            const content = await this.resource.readContents();
            return this.parser.parse(content);
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    open(): void {
        open(this.opener, this.resource.uri);
    }

}
