// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandService, MessageService, nls } from '@theia/core';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { RemoteContainerConnectionProvider } from '../electron-common/remote-container-connection-provider';
import { RemoteContainerCommands } from './container-connection-contribution';
import { RemoteStatusService } from '@theia/remote/lib/electron-common/remote-status-service';

@injectable()
export class DevContainerSuggestionContribution implements FrontendApplicationContribution {

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(RemoteContainerConnectionProvider)
    protected readonly connectionProvider: RemoteContainerConnectionProvider;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(RemoteStatusService)
    protected readonly remoteStatusService: RemoteStatusService;

    onStart(): void {
        this.checkForDevContainer();
    }

    protected async checkForDevContainer(): Promise<void> {
        const containerPort = parseInt(new URLSearchParams(location.search).get('port') ?? '0');
        if (containerPort > 0) {
            const status = await this.remoteStatusService.getStatus(containerPort);
            if (status?.alive) {
                return;
            }
        }

        await this.workspaceService.ready;
        const workspace = this.workspaceService.workspace;
        if (!workspace) {
            return;
        }

        try {
            const devcontainerFiles = await this.connectionProvider.getDevContainerFiles(workspace.resource.path.toString());
            if (devcontainerFiles.length > 0) {
                const reopenAction = nls.localize('theia/remote/dev-container/reopenInContainer', 'Reopen in Container');
                const dontShowAgain = nls.localizeByDefault("Don't Show Again");
                const result = await this.messageService.info(
                    nls.localize('theia/remote/dev-container/suggestion',
                        'This workspace has a dev container configuration. Would you like to reopen it in a container?'),
                    reopenAction,
                    dontShowAgain
                );
                if (result === reopenAction) {
                    this.commandService.executeCommand(RemoteContainerCommands.REOPEN_IN_CONTAINER.id);
                }
            }
        } catch (error) {
            // Silently ignore if we can't check for devcontainer files
        }
    }
}
