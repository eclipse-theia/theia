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

import {
    DebugSession,
    DebugAdapterExecutable,
} from "../common/debug-model";
import { DebugProtocol } from "vscode-debugprotocol";
import { injectable, inject } from "inversify";
import {
    createStreamConnection,
    IConnection
} from 'vscode-ws-jsonrpc/lib/server';
import {
    RawProcessFactory,
    ProcessManager,
    RawProcess
} from "@theia/process/lib/node";

@injectable()
export class DebugAdapterSession implements DebugSession {
    protected debugAdapterExecutable: DebugAdapterExecutable;
    protected sessionId: string;

    @inject(RawProcessFactory)
    protected readonly processFactory: RawProcessFactory;
    @inject(ProcessManager)
    protected readonly processManager: ProcessManager;

    constructor() { }

    sendRequest(request: DebugProtocol.Request): void {
        throw new Error("Method not implemented.");
    }

    dispose(): void {
        throw new Error("Method not implemented.");
    }

    start(): IConnection {
        const process = this.spawnProcess(this.debugAdapterExecutable);
        return createStreamConnection(process.output, process.input, () => process.kill());
    }

    assistedInit(sessionId: string, debugAdapterExecutable: DebugAdapterExecutable) {
        this.debugAdapterExecutable = debugAdapterExecutable;
        this.sessionId = sessionId;
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
