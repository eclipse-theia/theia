// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { Emitter } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { RemotePortForwardingProvider } from '../../electron-common/remote-port-forwarding-provider';

export interface ForwardedPort {
    localPort?: number;
    address?: string;
    origin?: string;
    editing: boolean;
}

@injectable()
export class PortForwardingService {

    @inject(RemotePortForwardingProvider)
    readonly provider: RemotePortForwardingProvider;

    protected readonly onDidChangePortsEmitter = new Emitter<void>();
    readonly onDidChangePorts = this.onDidChangePortsEmitter.event;

    forwardedPorts: ForwardedPort[] = [];

    @postConstruct()
    init(): void {
        this.provider.getForwardedPorts().then(ports => {
            this.forwardedPorts = ports.map(p => ({ address: p.address, localPort: p.port, editing: false }));
            this.onDidChangePortsEmitter.fire();
        });
    }

    forwardNewPort(origin?: string): ForwardedPort {
        const index = this.forwardedPorts.push({ editing: true, origin });
        return this.forwardedPorts[index - 1];
    }

    updatePort(port: ForwardedPort, newAdress: string): void {
        const connectionPort = new URLSearchParams(location.search).get('port');
        if (!connectionPort) {
            // if there is no open remote connection we can't forward a port
            return;
        }

        const parts = newAdress.split(':');
        if (parts.length === 2) {
            port.address = parts[0];
            port.localPort = parseInt(parts[1]);
        } else {
            port.localPort = parseInt(parts[0]);
        }

        port.editing = false;

        this.provider.forwardPort(parseInt(connectionPort), { port: port.localPort!, address: port.address });
        this.onDidChangePortsEmitter.fire();
    }

    removePort(port: ForwardedPort): void {
        const index = this.forwardedPorts.indexOf(port);
        if (index !== -1) {
            this.forwardedPorts.splice(index, 1);
            this.provider.portRemoved({ port: port.localPort! });
            this.onDidChangePortsEmitter.fire();
        }
    }

    isValidAddress(address: string): boolean {
        const match = address.match(/^(.*:)?\d+$/);
        if (!match) {
            return false;
        }

        const port = parseInt(address.includes(':') ? address.split(':')[1] : address);

        return !this.forwardedPorts.some(p => p.localPort === port);
    }
}
