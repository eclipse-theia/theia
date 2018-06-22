/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
