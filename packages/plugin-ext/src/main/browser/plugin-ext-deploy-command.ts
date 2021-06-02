/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { QuickOpenService, QuickOpenItem, QuickOpenModel, QuickOpenMode } from '@theia/core/lib/browser';
import { PluginServer } from '../../common';
import { Command } from '@theia/core/lib/common/command';

@injectable()
export class PluginExtDeployCommandService implements QuickOpenModel {

    private items: QuickOpenItem[];

    public static COMMAND: Command = {
        id: 'plugin-ext:deploy-plugin-id',
        category: 'Plugin',
        label: 'Deploy Plugin by Id',

    };

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    @inject(PluginServer)
    protected readonly pluginServer: PluginServer;

    constructor() {
        this.items = [];
    }

    /**
     * Whether the dialog is currently open.
     */
    protected isOpen: boolean = false;

    deploy(): void {
        const placeholderText = "Plugin's id to deploy.";

        this.isOpen = true;

        this.quickOpenService.open(this, {
            placeholder: placeholderText,
            fuzzyMatchLabel: true,
            fuzzyMatchDescription: true,
            fuzzySort: true,
            onClose: () => {
                this.isOpen = false;
            },
        });
    }

    public async onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): Promise<void> {
        this.items = [];
        if (lookFor || lookFor.length > 0) {
            this.items.push(this.createDeployQuickOpenItem(lookFor, 'Deploy this plugin'));
        }
        acceptor(this.items);
    }

    protected createDeployQuickOpenItem(name: string, description: string): DeployQuickOpenItem {
        return new DeployQuickOpenItem(name, this.pluginServer, description);
    }

}

export class DeployQuickOpenItem extends QuickOpenItem {

    constructor(
        protected readonly name: string,
        protected readonly pluginServer: PluginServer,
        protected readonly description?: string
    ) {
        super();
    }

    getLabel(): string {
        return this.name;
    }

    getDetail(): string {
        return this.description || '';
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        this.pluginServer.deploy(this.name);
        return true;
    }

}
