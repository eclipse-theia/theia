/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import {
    PLUGIN_RPC_CONTEXT,
    LanguagesContributionExt,
    LanguagesContributionMain
} from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import * as theia from '@theia/plugin';
import { ConnectionExtImpl } from './connection-ext';
import { ChildProcess, spawn, SpawnOptions } from 'child_process';
import { StreamMessageReader, StreamMessageWriter, Message } from 'vscode-jsonrpc';
import { Connection } from '../common/connection';
import { Disposable } from './types-impl';
import { InitializeRequest, InitializeParams } from 'vscode-languageserver-protocol';
import { isRequestMessage } from 'vscode-ws-jsonrpc';

/**
 * Implementation of languages contribution system of the plugin API.
 * It allows to register new language contribution in main side and to start language server.
 */
export class LanguagesContributionExtImpl implements LanguagesContributionExt {
    private proxy: LanguagesContributionMain;
    private serverConnections = new Map<string, Connection>();

    constructor(rpc: RPCProtocol,
        protected readonly connectionExt: ConnectionExtImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.LANGUAGES_CONTRIBUTION_MAIN);
    }

    /**
     * Says main side to register new language server.
     *
     * @param languageServerInfo information about new language server contribution
     */
    registerLanguageServerProvider(languageServerInfo: theia.LanguageServerInfo): Disposable {
        this.proxy.$registerLanguageServerProvider(languageServerInfo);
        return Disposable.create(() => {
            this.stop(languageServerInfo.id);
        });
    }

    /**
     * Stops the language server.
     *
     * @param id language server's id
     */
    stop(id: string): void {
        const connection = this.serverConnections.get(id);
        if (!connection) {
            return;
        }
        connection.dispose();
        this.serverConnections.delete(id);

        this.proxy.$stop(id);
    }

    /**
     * Starts language server.
     *
     * @param languageContribution is information about language server contribution
     */
    async $start(languageServerInfo: theia.LanguageServerInfo): Promise<void> {
        const clientConnection = await this.connectionExt.ensureConnection(languageServerInfo.id);

        if (!languageServerInfo.command) {
            throw new Error('The command to start language server has to be set');
        }

        const childProcess = this.spawnProcess(languageServerInfo.command, languageServerInfo.args);
        const serverConnection = createConnection(childProcess);

        this.serverConnections.set(languageServerInfo.id, serverConnection);

        clientConnection.forward(serverConnection, this.map.bind(this));
        serverConnection.forward(clientConnection, this.map.bind(this));
    }

    private spawnProcess(command: string, args: string[], options?: SpawnOptions): ChildProcess {
        return spawn(command,
            args,
            options);
    }

    private map(message: Message): Message {
        if (isRequestMessage(message)) {
            if (message.method === InitializeRequest.type.method) {
                const initializeParams = message.params as InitializeParams;
                initializeParams.processId = process.pid;
            }
        }
        return message;
    }
}

export function createConnection(childProcess: ChildProcess): Connection {
    const reader = new StreamMessageReader(childProcess.stdout);
    const writer = new StreamMessageWriter(childProcess.stdin);
    return {
        reader, writer,
        forward(to: Connection, map: (message: Message) => Message = message => message): void {
            reader.listen(input => {
                const output = map(input);
                to.writer.write(output);
            });
        },
        dispose: () => {
            childProcess.kill();
            reader.dispose();
            writer.dispose();
        }
    };
}
