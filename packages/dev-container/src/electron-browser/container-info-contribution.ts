// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import { WindowTitleContribution, WindowTitleService } from '@theia/core/lib/browser/window/window-title-service';
import { RemoteStatus, RemoteStatusService } from '@theia/remote/lib/electron-common/remote-status-service';
import { FrontendApplicationContribution, LabelProviderContribution } from '@theia/core/lib/browser';
import type { ContainerInspectInfo } from 'dockerode';
import { RemoteContainerConnectionProvider } from '../electron-common/remote-container-connection-provider';
import { PortForwardingService } from '@theia/remote/lib/electron-browser/port-forwarding/port-forwarding-service';
import { DEV_CONTAINER_PATH_QUERY } from '../electron-common/dev-container-workspaces';
import { URI } from '@theia/core';

@injectable()
export class ContainerInfoContribution implements FrontendApplicationContribution, WindowTitleContribution, LabelProviderContribution {
    @inject(RemoteContainerConnectionProvider)
    protected readonly connectionProvider: RemoteContainerConnectionProvider;

    @inject(PortForwardingService)
    protected readonly portForwardingService: PortForwardingService;

    @inject(RemoteStatusService)
    protected readonly remoteStatusService: RemoteStatusService;

    @inject(WindowTitleService)
    protected readonly windowTitleService: WindowTitleService;

    @inject(ILogger) @named('dev-container:ContainerInfoContribution')
    protected readonly logger: ILogger;

    protected status: RemoteStatus | undefined;
    protected containerInfo: ContainerInspectInfo | undefined;
    protected containerFilePath: string | undefined;

    onStart(): void {
        // Not awaited: two round trips that only decorate the window title and fill the forwarded ports;
        // the start-up does not wait for them.
        this.loadContainerInfo().catch(error => this.logger.warn('Could not load the information about the container.', error));
    }

    protected async loadContainerInfo(): Promise<void> {
        const containerPort = parseInt(new URLSearchParams(location.search).get('port') ?? '0');
        const [containerInfo, status] = await Promise.all([
            this.connectionProvider.getCurrentContainerInfo(containerPort),
            this.remoteStatusService.getStatus(containerPort)
        ]);
        this.status = status;

        this.portForwardingService.forwardedPorts.push(...Object.entries(containerInfo?.NetworkSettings.Ports ?? {}).flatMap(([_, ports]) => (
            ports.map(port => ({
                editing: false,
                address: port.HostIp ?? '',
                localPort: parseInt(port.HostPort ?? '0'),
                origin: 'container'
            })))));
        // The title was computed before the status was known.
        this.windowTitleService.update({});
    }

    enhanceTitle(title: string, parts: Map<string, string | undefined>): string {
        if (this.status && this.status.alive) {
            const devcontainerName = this.status.name;
            title = `${title} [Dev Container${devcontainerName ? ': ' + devcontainerName : ''}]`;
        }
        return title;
    }

    canHandle(element: object): number {
        if ('query' in element) {
            let containerFilePath = new URLSearchParams((element as URI).query).get(DEV_CONTAINER_PATH_QUERY);
            if (containerFilePath) {
                if (containerFilePath.startsWith((element as URI).path.toString())) {
                    containerFilePath = containerFilePath.replace((element as URI).path.toString(), '');
                }
                this.containerFilePath = containerFilePath;
                return 100;
            };
            return 0;
        }
        return 0;
    }

    getName(element: URI): string | undefined {
        const dir = new URI(this.containerFilePath).path.dir.base;
        return `${element.path.base} [Dev Container${dir && dir !== '.devcontainer' ? `: ${dir}` : ''}]`;
    }

}
