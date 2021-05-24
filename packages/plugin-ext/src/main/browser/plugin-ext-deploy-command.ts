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

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { PluginServer } from '../../common';
import { Command } from '@theia/core/lib/common/command';
import { QuickInputService, QuickPick, QuickPickItem } from '@theia/core/lib/browser';
import { ProgressService } from '@theia/core/lib/common';
import { Progress } from '@theia/core/lib/common/message-service-protocol';

@injectable()
export class PluginExtDeployCommandService /* implements QuickOpenModel */ {

    public static DEPLOY_PLUGIN_BY_ID_COMMAND: Command = {
        id: 'plugin-ext:deploy-plugin-id',
        category: 'Plugin',
        label: 'Deploy Plugin by Id',
    };

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;

    @inject(PluginServer)
    protected readonly pluginServer: PluginServer;

    @inject(ProgressService)
    protected readonly progressService: ProgressService;

    deploy(): void {
        this.quickInputService?.showQuickPick([],
            {
                placeholder: "Plugin's id to deploy.",
                onDidChangeValue: (quickPick: QuickPick<QuickPickItem>, filter: string) => {
                    quickPick.items = [{
                        label: filter,
                        detail: 'Deploy this plugin',
                        execute: () => this.executeDeployment(filter)
                    }];
                }
            }
        );
    }

    executeDeployment(name: string): void {
        Promise.all([
            this.progressService.showProgress({
                text: `Deploying plugin "${name}" ...`, options: { location: 'notification' }
            }),
            this.pluginServer.deploy(name)
        ]).then(([progress, result]) => {
            let msg = '';

            if (result.deployedPluginIds.length > 0) {
                msg = `Plugin "${result.deployedPluginIds[0]}" was deployed successfully!`;
            } else if (result.unresolvedPluginIds.length > 0) {
                msg = `Plugin "${result.unresolvedPluginIds[0]}" was not deployed! (no plugin resolver found)`;
            }

            progress.cancel();
            if (msg.length > 0) {
                this.progressService.showProgress({
                    text: msg, options: { location: 'notification' }
                }).then((prog: Progress) => {
                    setTimeout(prog.cancel, 5000);
                });
            }
        });
    }
}
