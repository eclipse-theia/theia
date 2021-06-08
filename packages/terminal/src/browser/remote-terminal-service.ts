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
import { MessageConnection } from '@theia/core/shared/vscode-ws-jsonrpc';
import { TerminalExitEvent, TerminalProcessInfo, TerminalSpawnOptions } from '@theia/process/lib/node';
import { v4 as uuid4 } from 'uuid';
import * as rt from '../common/remote-terminal-protocol';
import { RemoteTerminalProxyFactory } from '../common/remote-terminal-proxy-factory';
import { AttachedRemoteTerminal, RemoteTerminal } from './remote-terminal';

export const RemoteTerminalService = Symbol('RemoteTerminalService');
export interface RemoteTerminalService {

    create(): Promise<RemoteTerminal>;

    spawn(terminal: RemoteTerminal, options: rt.RemoteTerminalOptions & TerminalSpawnOptions): Promise<RemoteTerminal & AttachedRemoteTerminal>

    // fork(terminal: RemoteTerminal, options: RemoteTerminalOptions & TerminalForkOptions): Promise<RemoteTerminal & RemoteTerminalMetadata>

    attach(terminal: RemoteTerminal, options: rt.RemoteTerminalAttachOptions): Promise<RemoteTerminal & AttachedRemoteTerminal>
}

@injectable()
export class RemoteTerminalServiceImpl implements RemoteTerminalService {

    @inject(rt.RemoteTerminalServer)
    protected remoteTerminalServer: rt.RemoteTerminalServer;

    @inject(WebSocketConnectionProvider)
    protected connectionProvider: WebSocketConnectionProvider;

    async create(): Promise<RemoteTerminal> {
        const uuid = this.getRemoteTerminalConnectionId();
        const factory = new RemoteTerminalProxyFactory();
        return new RemoteTerminalImpl(uuid, factory.proxy, {
            onConnectCallback: connection => factory.listen(connection)
        });
    }

    async spawn(terminal: RemoteTerminal, options: rt.RemoteTerminalOptions & TerminalSpawnOptions): Promise<RemoteTerminal & AttachedRemoteTerminal> {
        RemoteTerminal.ensureNotDisposed(terminal);
        await this.connect(terminal);
        const { terminalId, info } = await this.remoteTerminalServer.spawn(terminal.uuid, options);
        return terminal.attach(terminalId, info);
    }

    async attach(terminal: RemoteTerminal, options: rt.RemoteTerminalAttachOptions): Promise<RemoteTerminal & AttachedRemoteTerminal> {
        RemoteTerminal.ensureNotDisposed(terminal);
        await this.connect(terminal);
        const { info } = await this.remoteTerminalServer.attach(terminal.uuid, options);
        return terminal.attach(options.terminalId, info);
    }

    protected async connect(terminal: RemoteTerminal): Promise<void> {
        RemoteTerminal.ensureNotConnected(terminal);
        const path = this.getRemoteTerminalPath(terminal.uuid);
        const connection = await this.createRemoteTerminalConnection(path);
        try {
            terminal.connect(connection);
        } catch (error) {
            connection.dispose();
            throw error;
        }
    }

    protected getRemoteTerminalConnectionId(): rt.RemoteTerminalConnectionId {
        return uuid4();
    }

    protected getRemoteTerminalPath(uuid: rt.RemoteTerminalConnectionId): string {
        return rt.REMOTE_TERMINAL_CONNECTION_PATH_TEMPLATE
            .replace(':uuid', uuid.toString());
    }

    protected async createRemoteTerminalConnection(path: string): Promise<MessageConnection> {
        return new Promise(onConnection => { this.connectionProvider.listen({ path, onConnection }); });
    }
}

export class RemoteTerminalImpl implements RemoteTerminal {

    terminalId?: number;
    info?: TerminalProcessInfo;
    exitStatus?: TerminalExitEvent;

    protected disposed: boolean = false;
    protected connection?: MessageConnection;

    constructor(
        public uuid: rt.RemoteTerminalConnectionId,
        public proxy: rt.RemoteTerminalProxy,
        protected options: {
            onConnectCallback?: (connection: MessageConnection) => void
        } = {}
    ) {
        this.proxy.onExit(status => { this.exitStatus = status; });
    }

    connect(connection: MessageConnection): void {
        RemoteTerminal.ensureNotDisposed(this);
        RemoteTerminal.ensureNotConnected(this);
        this.connection = connection;
        this.options.onConnectCallback?.(connection);
    }

    attach(terminalId: number, info: TerminalProcessInfo): AttachedRemoteTerminal {
        RemoteTerminal.ensureNotDisposed(this);
        RemoteTerminal.ensureNotAttached(this);
        this.terminalId = terminalId;
        this.info = info;
        return this as AttachedRemoteTerminal;
    }

    isConnected(): boolean {
        return this.connection !== undefined;
    }

    isAttached(): this is AttachedRemoteTerminal {
        return this.terminalId !== undefined;
    }

    isDisposed(): boolean {
        return this.disposed;
    }

    dispose(): void {
        if (!this.disposed) {
            this.disposed = true;
            this.proxy.dispose();
            this.connection?.dispose();
        }
    }
}
