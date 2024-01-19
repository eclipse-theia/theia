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
import { AbstractRemoteRegistryContribution, RemoteRegistry } from '@theia/remote/lib/electron-browser/remote-registry-contribution';
import { RemoteContainerConnectionProvider } from '../electron-common/remote-container-connection-provider';

@injectable()
export class ContainerConnectionContribution extends AbstractRemoteRegistryContribution {

    @inject(RemoteContainerConnectionProvider)
    protected readonly connectionProvider: RemoteContainerConnectionProvider;

    registerRemoteCommands(registry: RemoteRegistry): void {
        registry.registerCommand({
            id: 'dev-container:reopen-in-container',
            label: 'Reopen in Container'
        }, {
            execute: () => this.openInContainer()
        });

    }

    async openInContainer(): Promise<void> {
        const port = await this.connectionProvider.connectToContainer();
        this.openRemote(port, false);
    }

}
