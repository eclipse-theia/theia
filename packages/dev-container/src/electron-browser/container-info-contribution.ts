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

import { inject, injectable } from '@theia/core/shared/inversify';
import { WindowTitleContribution } from '@theia/core/lib/browser/window/window-title-service';
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

    protected status: RemoteStatus | undefined;
    protected containerInfo: ContainerInspectInfo | undefined;
    protected containerFilePath: string | undefined;

    async onStart(): Promise<void> {
        const containerPort = parseInt(new URLSearchParams(location.search).get('port') ?? '0');
        const containerInfo = await this.connectionProvider.getCurrentContainerInfo(containerPort);
        this.status = await this.remoteStatusService.getStatus(containerPort);

        this.portForwardingService.forwardedPorts = Object.entries(containerInfo?.NetworkSettings.Ports ?? {}).flatMap(([_, ports]) => (
            ports.map(port => ({
                editing: false,
                address: port.HostIp ?? '',
                localPort: parseInt(port.HostPort ?? '0'),
                origin: 'container'
            }))));
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
