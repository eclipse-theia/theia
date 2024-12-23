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
import { RemoteStatus, RemoteStatusService } from '../electron-common/remote-status-service';
import { RemoteConnectionService } from './remote-connection-service';

@injectable()
export class RemoteStatusServiceImpl implements RemoteStatusService {

    @inject(RemoteConnectionService)
    protected remoteConnectionService: RemoteConnectionService;

    async getStatus(localPort: number): Promise<RemoteStatus> {
        const connection = this.remoteConnectionService.getConnectionFromPort(localPort);
        if (connection) {
            return {
                alive: true,
                name: connection.name,
                type: connection.type
            };
        } else {
            return {
                alive: false
            };
        }
    }

    async connectionClosed(localPort: number): Promise<void> {
        const connection = this.remoteConnectionService.getConnectionFromPort(localPort);
        if (connection) {
            connection.dispose();
        }
    }
}
