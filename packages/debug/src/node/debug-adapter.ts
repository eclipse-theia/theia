/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import * as http from 'http';
import * as https from 'https';
import { injectable, inject } from "inversify";
import { openJsonRpcSocket, BackendApplicationContribution } from "@theia/core/lib/node";
import { IConnection } from "@theia/languages/lib/node";
import { ILogger } from "@theia/core";
import { Deferred } from '@theia/core/lib/common/promise-util';
import {
    DebugSession,
    DebugAdapterExecutable,
    DebugAdapterFactory,
    DebugSessionPath,
} from "../common/debug-model";
import {
    createStreamConnection,
    createWebSocketConnection,
    forward
} from 'vscode-ws-jsonrpc/lib/server';
import {
    RawProcessFactory,
    ProcessManager,
    RawProcess
} from "@theia/process/lib/node";

@injectable()
export class ServerContainer implements BackendApplicationContribution {
    protected server = new Deferred<http.Server | https.Server>();

    onStart(server: http.Server | https.Server): void {
        this.server.resolve(server);
    }

    getServer(): Promise<http.Server | https.Server> {
        return this.server.promise;
    }
}

@injectable()
export class DebugSessionImpl implements DebugSession {
    id: string;
    executable: DebugAdapterExecutable;

    @inject(DebugAdapterFactory)
    protected readonly adapterFactory: DebugAdapterFactory;
    @inject(ILogger)
    protected readonly logger: ILogger;
    @inject(ServerContainer)
    protected readonly serverContainer: ServerContainer;

    start(): Promise<void> {
        const adapterConnection = this.adapterFactory.start(this.executable);
        const path = DebugSessionPath + "/" + this.id;

        this.serverContainer.getServer().then(server => {
            openJsonRpcSocket({ server, path }, socket => {
                try {
                    const clientConnection = createWebSocketConnection(socket);
                    forward(clientConnection, adapterConnection);
                } catch (e) {
                    this.logger.error(`Error occurred while starting debug adapter. ${path}.`, e);
                    socket.dispose();
                }
            });
        });

        return Promise.resolve();
    }

    dispose(): void { }
}

/**
 * DebugAdapterFactory implementation based on launching the debug adapter
 * as a separate process.
 */
@injectable()
export class LauncherBasedDebugAdapterFactory implements DebugAdapterFactory {
    @inject(RawProcessFactory)
    protected readonly processFactory: RawProcessFactory;
    @inject(ProcessManager)
    protected readonly processManager: ProcessManager;

    start(executable: DebugAdapterExecutable): IConnection {
        const process = this.spawnProcess(executable);
        return createStreamConnection(process.output, process.input, () => process.kill());
    }

    private spawnProcess(executable: DebugAdapterExecutable): RawProcess {
        const rawProcess = this.processFactory({ command: executable.command, args: executable.args });
        rawProcess.process.stdout.on('data', this.logStdOut.bind(this));
        rawProcess.process.stdin.on('data', this.logStdIn.bind(this));
        rawProcess.process.once('error', this.onDidFailSpawnProcess.bind(this));
        rawProcess.process.stderr.on('data', this.logError.bind(this));
        return rawProcess;
    }

    private logStdIn(data: string | Buffer) {
        if (data) {
            console.info(data);
        }
    }

    private logStdOut(data: string | Buffer) {
        if (data) {
            console.info(data);
        }
    }

    private onDidFailSpawnProcess(error: Error): void {
        console.error(error);
    }

    private logError(data: string | Buffer) {
        if (data) {
            console.error(data);
        }
    }
}
