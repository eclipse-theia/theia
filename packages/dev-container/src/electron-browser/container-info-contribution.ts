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
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import type { ContainerInspectInfo } from 'dockerode';
import { RemoteContainerConnectionProvider } from '../electron-common/remote-container-connection-provider';
import { PortForwardingService } from '@theia/remote/lib/electron-browser/port-forwarding/port-forwarding-service';
import { getCurrentPort } from '@theia/core/lib/electron-browser/messaging/electron-local-ws-connection-source';
import { WindowTitleService } from '@theia/core/lib/browser/window/window-title-service';

@injectable()
export class ContainerInfoContribution implements FrontendApplicationContribution {

    @inject(RemoteContainerConnectionProvider)
    protected readonly connectionProvider: RemoteContainerConnectionProvider;

    @inject(PortForwardingService)
    protected readonly portForwardingService: PortForwardingService;

    @inject(WindowTitleService)
    protected readonly windowTitleService: WindowTitleService;

    containerInfo: ContainerInspectInfo | undefined;

    initialize(): void {
        this.connectionProvider.getCurrentContainerInfo(parseInt(new URLSearchParams(location.search).get('port') ?? '0')).then(info => {
            if (info) {
                this.containerInfo = info;
                this.windowTitleService.update({
                    devContainer: `Dev Container @ ${info?.Platform ?? ''}`
                });
            }
        });
    }

    async onStart(): Promise<void> {
        this.portForwardingService.forwardedPorts = Object.entries(this.containerInfo?.NetworkSettings.Ports ?? {}).flatMap(([_, ports]) => (
            ports.map(port => ({
                editing: false,
                address: port.HostIp ?? '',
                localPort: parseInt(port.HostPort ?? '0'),
                origin: 'container'
            }))));
    }

}
