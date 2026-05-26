// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { RemoteContainerConnectionProvider } from '../electron-common/remote-container-connection-provider';
import { AbstractRemoteRegistryContribution } from '@theia/remote/lib/electron-browser/remote-registry-contribution';
import { ILogger, MessageService, nls } from '@theia/core';
import { RemotePreferences } from '@theia/remote/lib/electron-common/remote-preferences';

@injectable()
export class DevContainerStartupContribution extends AbstractRemoteRegistryContribution implements FrontendApplicationContribution {

    @inject(RemoteContainerConnectionProvider)
    protected readonly connectionProvider: RemoteContainerConnectionProvider;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(RemotePreferences)
    protected readonly remotePreferences: RemotePreferences;

    registerRemoteCommands(): void {
        // no commands to register — this contribution only handles startup
    }

    onStart(): void {
        this.handleStartupAttach();
    }

    protected async handleStartupAttach(): Promise<void> {
        try {
            const args = await this.connectionProvider.getAttachContainerArgs();
            if (!args) {
                return;
            }

            const { containerId, scanForDevJson } = args;
            this.logger.info(`CLI: --attach-container ${containerId}, initiating attach from frontend...`);

            const containers = await this.connectionProvider.listRunningContainers();
            // Match by ID prefix (either direction — user may pass a short prefix or a full 64-char ID
            // while listRunningContainers returns 12-char truncated IDs) or exact name.
            const matches = containers.filter(c => c.id.startsWith(containerId) || containerId.startsWith(c.id) || c.name === containerId);
            if (matches.length > 1) {
                this.logger.warn(`CLI: container identifier "${containerId}" matches ${matches.length} containers, using first match: ${matches[0].name || matches[0].id}`);
            }
            const target = matches[0];

            if (!target) {
                const msg = nls.localize('theia/remote/dev-container/cliContainerNotFound',
                    'Container "{0}" not found or not running.', containerId);
                this.logger.error(`CLI: ${msg}`);
                this.messageService.error(msg);
                return;
            }

            const candidates = await this.connectionProvider.getWorkspaceCandidates(target.id);
            const workspacePath = candidates.length > 0 ? candidates[0].path : '/';

            const devcontainerFile = scanForDevJson
                ? await this.connectionProvider.scanForDevContainerConfig(target.id, workspacePath)
                : undefined;

            const result = await this.connectionProvider.attachToContainer({
                containerId: target.id,
                workspacePath,
                devcontainerFile,
                nodeDownloadTemplate: this.remotePreferences['remote.nodeDownloadTemplate'],
            });

            this.logger.info(`CLI: startup attach ready, proxy on port ${result.port}, workspace: ${result.workspacePath}`);
            this.openRemote(result.port, false, result.workspacePath);
        } catch (e) {
            this.logger.error('CLI: Failed to attach to container during startup:', e);
            this.messageService.error(nls.localize(
                'theia/remote/dev-container/cliAttachError',
                'Failed to attach to container: {0}',
                e instanceof Error ? e.message : String(e)
            ));
        }
    }
}
