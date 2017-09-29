/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// tslint:disable:no-any
import cluster = require('cluster');
import { JsonRpcProxyFactory, JsonRpcProxy } from '../../common/messaging';
import { ConsoleLogger } from '../messaging/logger';
import { createWorkerConnection } from './worker-connection';

/**
 * The cluster master process.
 */
export interface IMasterProcess {
    /**
     * Notify when the current server process is ready.
     */
    onDidInitialize(): void;
    /**
     * Restart the current server process.
     */
    restart(): Promise<void>;
}

/**
 * The express server process.
 */
export interface IServerProcess {
}

export function createWorkerProxy<T extends object>(worker: cluster.Worker, target: any): JsonRpcProxy<T> {
    const logger = new ConsoleLogger();
    const connection = createWorkerConnection(worker, logger);
    const factory = new JsonRpcProxyFactory<T>(target);
    factory.listen(connection);
    return factory.createProxy();
}

export type RemoteServer = JsonRpcProxy<IServerProcess>;
export function createRemoteServer(worker: cluster.Worker, target: IMasterProcess): RemoteServer {
    return createWorkerProxy(worker, target);
}
export type RemoteMaster = JsonRpcProxy<IMasterProcess>;
export function createRemoteMaster(worker: cluster.Worker, target: IServerProcess): RemoteMaster {
    return createWorkerProxy(worker, target);
}
