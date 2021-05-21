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

import { Disposable } from '@theia/core';
import { MessagingService } from '@theia/core/lib/node';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MessageConnection } from '@theia/core/shared/vscode-ws-jsonrpc';
import { Terminal, TerminalFactory, TerminalProcessInfo, TerminalSpawnOptions } from '@theia/process/lib/node';
import { TerminalManager } from '@theia/process/lib/node';
import { Readable } from 'stream';
import { RemoteTerminalServer, REMOTE_TERMINAL_CONNECTION_PATH_TEMPLATE } from '../common/terminal-protocol';

@injectable()
export class RemoteTerminalServerImpl implements RemoteTerminalServer, MessagingService.Contribution, Disposable {

    protected connections = new Map<number, RemoteTerminalConnection>();

    @inject(TerminalManager)
    protected terminalManager: TerminalManager;

    @inject(TerminalFactory)
    protected terminalFactory: TerminalFactory;

    async create(id: number, options: TerminalSpawnOptions): Promise<{ terminalId: number, info: TerminalProcessInfo }> {
        const rtc = this.getRemoteTerminalConnection(id);
        const terminal = await this.terminalFactory.spawn(options);
        rtc.attach(terminal);
        return {
            terminalId: terminal._id,
            info: terminal.info
        };
    }

    async attach(id: number, terminalId: number): Promise<{ info: TerminalProcessInfo }> {
        const rtc = this.getRemoteTerminalConnection(id);
        const terminal = this.getTerminal(terminalId);
        rtc.attach(terminal);
        return {
            info: terminal.info
        };
    }

    configure(service: MessagingService): void {
        service.listen(REMOTE_TERMINAL_CONNECTION_PATH_TEMPLATE, (params, connection) => {
            const id = parseInt(params.id, 10);
            this.createRemoteTerminalConnection(id, connection);
        });
    }

    dispose(): void {
        for (const rtc of this.connections.values()) {
            this.disposeRemoteTerminalConnection(rtc);
        }
    }

    protected createRemoteTerminalConnection(id: number, connection: MessageConnection): RemoteTerminalConnection {
        if (this.connections.has(id)) {
            throw new Error(`remote terminal already exists id: ${id}`);
        }
        const rtc = new RemoteTerminalConnection(id, connection);
        this.connections.set(id, rtc);
        connection.onDispose(() => this.disposeRemoteTerminalConnection(rtc));
        connection.onClose(() => this.disposeRemoteTerminalConnection(rtc));
        return rtc;
    }

    protected getTerminal(terminalId: number): Terminal {
        const terminal = this.terminalManager.get(terminalId);
        if (terminal === undefined) {
            throw new Error(`terminal not found terminalId: ${terminalId}`);
        }
        return terminal;
    }

    protected getRemoteTerminalConnection(id: number): RemoteTerminalConnection {
        const rtc = this.connections.get(id);
        if (rtc === undefined) {
            throw new Error(`unknown remote terminal connection id: ${id}`);
        }
        if (rtc.isAttached) {
            throw new Error(`remote terminal connection is already attached id: ${id}`);
        }
        return rtc;
    }

    protected disposeRemoteTerminalConnection(rtc: RemoteTerminalConnection): void {
        if (this.connections.delete(rtc.id)) {
            rtc.dispose();
        }
    }
}

/**
 * Represents the connection opened from the client.
 *
 * Instances
 */
export class RemoteTerminalConnection implements Disposable {

    protected terminal?: Terminal;
    protected output?: Readable & Disposable;

    constructor(
        readonly id: number,
        readonly connection: MessageConnection
    ) { }

    get isAttached(): boolean {
        return this.terminal !== undefined;
    }

    attach(terminal: Terminal): void {
        this.terminal = terminal;
        this.output = terminal.getOutputStream();
        this.output.on('data', data => this.connection.sendNotification('onData', data));
        this.terminal.onExit(event => this.connection.sendNotification('onExit', event));
        this.terminal.onClose(event => this.connection.sendNotification('onClose', event));
        this.connection.onRequest('getExitStatus', () => terminal.exitStatus);
        this.connection.onRequest('write', data => { terminal.write(data); });
        this.connection.onRequest('kill', () => { terminal.kill(); });
    }

    dispose(): void {
        this.output?.dispose();
        this.connection.dispose();
    }
}
