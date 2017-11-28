/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from "path";
import * as cp from "child_process";
import { injectable, inject } from "inversify";
import { JsonRpcProxyFactory, ILogger, ConnectionErrorHandler, DisposableCollection, Disposable } from "@theia/core";
import { Trace, Message, IPCMessageReader, IPCMessageWriter, createMessageConnection, MessageConnection } from "vscode-jsonrpc";
import { FileSystemWatcherServer, WatchOptions, FileSystemWatcherClient, ReconnectingFileSystemWatcherServer } from "../common/filesystem-watcher-protocol";

export const CHOKIDAR_WATCHER = 'chokidar-watcher';

@injectable()
export class HostFileSystemWatcherServer implements FileSystemWatcherServer {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected readonly proxyFactory = new JsonRpcProxyFactory<FileSystemWatcherServer>();
    protected readonly remote = new ReconnectingFileSystemWatcherServer(this.proxyFactory.createProxy());
    protected readonly errorHandler = new ConnectionErrorHandler({
        serverName: CHOKIDAR_WATCHER
    });

    protected readonly toDispose = new DisposableCollection();

    constructor() {
        this.remote.setClient({
            onDidFilesChanged: e => {
                if (this.client) {
                    this.client.onDidFilesChanged(e);
                }
            }
        });
        this.toDispose.push(this.remote);
        this.toDispose.push(this.listen());
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    watchFileChanges(uri: string, options?: WatchOptions): Promise<number> {
        return this.remote.watchFileChanges(uri, options);
    }

    unwatchFileChanges(watcher: number): Promise<void> {
        return this.remote.unwatchFileChanges(watcher);
    }

    protected client: FileSystemWatcherClient | undefined;
    setClient(client: FileSystemWatcherClient | undefined): void {
        this.client = client;
    }

    protected listen(): Disposable {
        const watcherProcess = this.fork();
        const connection = this.createConnection(watcherProcess);

        const toStop = new DisposableCollection();
        const toCancelStop = toStop.push(Disposable.create(() => watcherProcess.kill()));
        connection.onError((e: [Error, Message | undefined, number | undefined]) => {
            if (this.errorHandler.shouldStop(e[0], e[1], e[2])) {
                toStop.dispose();
            }
        });
        connection.onClose(() => {
            if (this.toDispose.disposed) {
                return;
            }
            const error = this.errorHandler.shouldRestart();
            if (error) {
                this.logger.error(error);
            } else {
                toCancelStop.dispose();
                toStop.push(this.listen());
            }
        });
        connection.trace(Trace.Off, {
            log: (message, data) => this.logger.info(`[${CHOKIDAR_WATCHER}: ${watcherProcess.pid}] ${message} ${data}`)
        });
        this.proxyFactory.listen(connection);
        return toStop;
    }

    protected fork(debug: boolean = false): cp.ChildProcess {
        // FIXME extract the utility function to fork Theia
        const options: cp.ForkOptions = {
            silent: true,
            env: {
                ...process.env,
                'THEIA_PARENT_PID': String(process.pid)
            },
            execArgv: []
        };
        if (debug) {
            options.execArgv = ['--nolazy', '--inspect=0'];
        }
        const watcherProcess = cp.fork(path.resolve(__dirname, CHOKIDAR_WATCHER), [], options);
        watcherProcess.stdout.on('data', data => this.logger.info(`[${CHOKIDAR_WATCHER}: ${watcherProcess.pid}] ${data.toString()}`));
        watcherProcess.stderr.on('data', data => this.logger.error(`[${CHOKIDAR_WATCHER}: ${watcherProcess.pid}] ${data.toString()}`));
        return watcherProcess;
    }

    protected createConnection(watcherProcess: cp.ChildProcess): MessageConnection {
        const reader = new IPCMessageReader(watcherProcess);
        const writer = new IPCMessageWriter(watcherProcess);
        return createMessageConnection(reader, writer, {
            error: (message: string) => this.logger.error(`[${CHOKIDAR_WATCHER}: ${watcherProcess.pid}] ${message}`),
            warn: (message: string) => this.logger.warn(`[${CHOKIDAR_WATCHER}: ${watcherProcess.pid}] ${message}`),
            info: (message: string) => this.logger.info(`[${CHOKIDAR_WATCHER}: ${watcherProcess.pid}] ${message}`),
            log: (message: string) => this.logger.info(`[${CHOKIDAR_WATCHER}: ${watcherProcess.pid}] ${message}`)
        });
    }

}
