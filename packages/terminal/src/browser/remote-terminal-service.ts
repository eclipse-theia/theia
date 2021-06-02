/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import { WebSocketConnectionProvider } from '@theia/core/lib/browser';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TerminalSpawnOptions } from '@theia/process/lib/node';
import { v4 as uuid4 } from 'uuid';
// eslint-disable-next-line max-len
import { RemoteTerminalAttachOptions, RemoteTerminalConnectionId, RemoteTerminalOptions, RemoteTerminalProxy, RemoteTerminalServer, REMOTE_TERMINAL_CONNECTION_PATH_TEMPLATE } from '../common/terminal-protocol';
import { RemoteTerminal, RemoteTerminalHandle } from './remote-terminal';

export const RemoteTerminalService = Symbol('RemoteTerminalService');
export interface RemoteTerminalService {

    create(): Promise<RemoteTerminalHandle>;

    spawn(handle: RemoteTerminalHandle, options: RemoteTerminalOptions & TerminalSpawnOptions): Promise<RemoteTerminal>

    // fork(handle: RemoteTerminalHandle, options: RemoteTerminalOptions & TerminalForkOptions): Promise<RemoteTerminal>

    attach(handle: RemoteTerminalHandle, options: RemoteTerminalAttachOptions): Promise<RemoteTerminal>
}

@injectable()
export class RemoteTerminalServiceImpl implements RemoteTerminalService {

    @inject(RemoteTerminalServer)
    protected remoteTerminalServer: RemoteTerminalServer;

    @inject(WebSocketConnectionProvider)
    protected connectionProvider: WebSocketConnectionProvider;

    async create(): Promise<RemoteTerminalHandle> {
        const uuid = this.getRemoteTerminalConnectionId();
        const path = this.getRemoteTerminalPath(uuid);
        const remote = this.connectionProvider.createProxy<RemoteTerminalProxy>(path);
        return {
            uuid,
            remote,
            dispose(): void {
                remote.dispose();
            }
        };
    }

    async spawn(handle: RemoteTerminalHandle, options: RemoteTerminalOptions & TerminalSpawnOptions): Promise<RemoteTerminal> {
        const { terminalId, info } = await this.remoteTerminalServer.spawn(handle.uuid, options);
        return {
            terminalId,
            handle,
            info,
        };
    }

    async attach(handle: RemoteTerminalHandle, options: RemoteTerminalAttachOptions): Promise<RemoteTerminal> {
        const { info } = await this.remoteTerminalServer.attach(handle.uuid, options);
        return {
            terminalId: options.terminalId,
            handle,
            info,
        };
    }

    protected getRemoteTerminalConnectionId(): RemoteTerminalConnectionId {
        return uuid4();
    }

    protected getRemoteTerminalPath(uuid: RemoteTerminalConnectionId): string {
        return REMOTE_TERMINAL_CONNECTION_PATH_TEMPLATE
            .replace(':uuid', uuid.toString());
    }
}
