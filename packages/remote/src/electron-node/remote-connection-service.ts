// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
import { RemoteConnection } from './remote-types';
import { Disposable } from '@theia/core';
import { RemoteCopyService } from './setup/remote-copy-service';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { RemoteSetupService } from './setup/remote-setup-service';

@injectable()
export class RemoteConnectionService implements BackendApplicationContribution {

    @inject(RemoteCopyService)
    protected readonly copyService: RemoteCopyService;

    // Workaround for the fact that connection scoped services cannot directly inject these services.
    @inject(RemoteSetupService)
    protected readonly remoteSetupService: RemoteSetupService;

    protected readonly connections = new Map<string, RemoteConnection>();

    getConnection(id: string): RemoteConnection | undefined {
        return this.connections.get(id);
    }

    getConnectionFromPort(port: number): RemoteConnection | undefined {
        return Array.from(this.connections.values()).find(connection => connection.localPort === port);
    }

    register(connection: RemoteConnection): Disposable {
        this.connections.set(connection.id, connection);
        return Disposable.create(() => {
            this.connections.delete(connection.id);
        });
    }

    onStop(): void {
        for (const connection of this.connections.values()) {
            connection.dispose();
        }
    }
}
