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
export class DebugAdapterSession implements DebugSession {
    id: string;
    protected executable: DebugAdapterExecutable;

    constructor(
        @inject(DebugAdapterFactory) protected readonly adapterFactory: DebugAdapterFactory,
        @inject(ServerContainer) protected readonly serverContainer: ServerContainer,
        @inject(ILogger) protected readonly logger: ILogger, ) { }

    assistedInit(id: string, executable: DebugAdapterExecutable) {
        this.executable = executable;
        this.id = id;
    }

    start(): void {
        const adapterConnection = this.adapterFactory.create(this.executable);
        const path = DebugSessionPath + "/" + this.id;

        this.serverContainer.getServer().then(server => {
            openJsonRpcSocket({ server, path }, socket => {
                try {
                    const connection = createWebSocketConnection(socket);
                    forward(connection, adapterConnection);
                } catch (e) {
                    this.logger.error(`Error occurred while starting debug adapter. ${path}.`, e);
                    socket.dispose();
                    throw e;
                }
            });
        });
    }

    dispose(): void { }
}

@injectable()
export class LauncherBasedDebugAdapterFactory implements DebugAdapterFactory {
    @inject(RawProcessFactory)
    protected readonly processFactory: RawProcessFactory;

    @inject(ProcessManager)
    protected readonly processManager: ProcessManager;

    create(executable: DebugAdapterExecutable): IConnection {
        const process = this.spawnProcess(executable);
        return createStreamConnection(process.output, process.input, () => process.kill());
    }

    private spawnProcess(executable: DebugAdapterExecutable): RawProcess {
        const rawProcess = this.processFactory({ command: executable.command, args: executable.args });
        rawProcess.process.once('error', this.onDidFailSpawnProcess.bind(this));
        rawProcess.process.stderr.on('data', this.logError.bind(this));
        return rawProcess;
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

@injectable()
export class ServerContainer implements BackendApplicationContribution {
    private server = new Deferred<http.Server | https.Server>();

    onStart(server: http.Server | https.Server): void {
        this.server.resolve(server);
    }

    getServer(): Promise<http.Server | https.Server> {
        return this.server.promise;
    }
}
