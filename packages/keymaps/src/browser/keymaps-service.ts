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
import { Disposable, DisposableCollection, CommandRegistry, ILogger, ResourceProvider, Resource, MessageService } from '@theia/core/lib/common';
import { FrontendApplicationContribution, FrontendApplication, KeybindingRegistry, KeybindingScope } from '@theia/core/lib/browser';
import { UserStorageUri } from '@theia/userstorage/lib/browser/';
import parseKeybindings from '../common/keymaps-validation';
import URI from '@theia/core/lib/common/uri';

export const keymapsUri: URI = new URI('keymaps.json').withScheme(UserStorageUri.SCHEME);

@injectable()
export class KeymapsService implements Disposable, FrontendApplicationContribution {

    protected readonly toDispose = new DisposableCollection();
    protected keymapsResource: Resource;
    protected ready = false;

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(KeybindingRegistry)
    protected readonly keyBindingRegistry: KeybindingRegistry;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @postConstruct()
    protected async init() {
        // this.ajv.compile(keymapsSchema);
        const resource = await this.resourceProvider(keymapsUri);
        this.keymapsResource = resource;

        this.toDispose.push(this.keymapsResource);

        if (this.keymapsResource.onDidChangeContents) {
            this.keymapsResource.onDidChangeContents(() => {
                this.onDidChangeKeymap();
            });
        }

        this.parseAndSetKeybindings(await this.keymapsResource.readContents());
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    onStart(app?: FrontendApplication): void {
        this.ready = true;
    }

    protected onDidChangeKeymap(): void {
        this.keymapsResource.readContents().then(content => {
            try {
                this.parseAndSetKeybindings(content);
                this.messageService.info(`[${this.keymapsResource.uri}] updated the user keybindings`);
            } catch (error) {
                const errors = error.messages || [error.message];
                for (const message of errors) {
                    this.messageService.error(`[${this.keymapsResource.uri}] ${message}`);
                }
            }
        });
    }

    /**
     * Actually parses some raw content and tries to update the USER keybindings.
     * Throws if the parsing or validation fail.
     *
     * @param content the raw text defining the keybindings
     */
    protected parseAndSetKeybindings(content: string): void {
        const keybindings = parseKeybindings(content); // can throw
        if (keybindings.length) {
            this.keyBindingRegistry.setKeymap(KeybindingScope.USER, keybindings);
        }
    }
}
