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
import { RemoteTerminalProxy, RemoteTerminal, RemoteTerminalServer, REMOTE_TERMINAL_CONNECTION_PATH_TEMPLATE } from '../common/terminal-protocol';

export const RemoteTerminalService = Symbol('RemoteTerminalService');
export interface RemoteTerminalService {

    create(): Promise<RemoteTerminal>

    attach(terminalId: number): Promise<RemoteTerminal>
}

@injectable()
export class DefaultRemoteTerminalService implements RemoteTerminalService {

    protected sequence = 0;

    @inject(RemoteTerminalServer)
    protected remoteTerminalServer: RemoteTerminalServer;

    @inject(WebSocketConnectionProvider)
    protected connectionProvider: WebSocketConnectionProvider;

    async create(options?: TerminalSpawnOptions): Promise<RemoteTerminal> {
        const id = this.getNextId();
        const remote = await this.createRemoteTerminalProxy(id);
        options = options ?? { executable: 'echo', arguments: ['hello', 'world'] };
        const { terminalId, info } = await this.remoteTerminalServer.create(id, options);
        return {
            _id: id,
            terminalId,
            info,
            remote,
            dispose(this: RemoteTerminal): void {
                this.remote.dispose();
            }
        };
    }

    async attach(terminalId: number): Promise<RemoteTerminal> {
        const id = this.getNextId();
        const remote = await this.createRemoteTerminalProxy(id);
        const { info } = await this.remoteTerminalServer.attach(id, terminalId);
        return {
            _id: id,
            terminalId,
            info,
            remote,
            dispose(this: RemoteTerminal): void {
                this.remote.dispose();
            }
        };
    }

    protected getNextId(): number {
        return this.sequence++;
    }

    protected async createRemoteTerminalProxy(id: number): Promise<RemoteTerminalProxy> {
        const path = this.getRemoteTerminalPath(id);
        const terminal = this.connectionProvider.createProxy<RemoteTerminalProxy>(path);
        await new Promise(resolve => terminal.onDidOpenConnection(resolve));
        return terminal;
    }

    protected getRemoteTerminalPath(id: number): string {
        return REMOTE_TERMINAL_CONNECTION_PATH_TEMPLATE
            .replace(':id', id.toString());
    }
}
