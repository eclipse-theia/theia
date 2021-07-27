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

import { inject, injectable } from 'inversify';
import { Connection } from '../../common/messaging/connection';
import { ConnectionProvider, ConnectOptions } from './connection-provider';
import { HttpLongPollingConnectionProvider } from './http-long-polling-connection-provider';
import { WebSocketConnectionProvider } from './websocket-connection-provider';

/**
 * Default implementation for `ConnectionProvider`.
 */
@injectable()
export class ConnectionProviderImpl implements ConnectionProvider {

    @inject(WebSocketConnectionProvider)
    protected wsConnectionProvider: WebSocketConnectionProvider;

    @inject(HttpLongPollingConnectionProvider)
    protected hlpConnectionProvider: HttpLongPollingConnectionProvider;

    async connect(serviceId: string, options?: ConnectOptions): Promise<Connection> {
        for (let i = 0; i < 3; i++) {
            try {
                return await this.wsConnectionProvider.connect(serviceId);
            } catch (error) {
                console.error(error);
            }
        }
        console.warn('Unable to create a WebSocket connection, will do HTTP long polling instead');
        return this.hlpConnectionProvider.connect(serviceId);
    }
}
