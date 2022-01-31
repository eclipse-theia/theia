/********************************************************************************
 * Copyright (C) 2012 TypeFox and others.
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

import { injectable, interfaces } from 'inversify';
import { JsonRpcProxy } from '../../common/messaging';
import { WebSocketChannel } from '../../common/messaging/web-socket-channel';
import { AbstractConnectionProvider } from '../../common/messaging/abstract-connection-provider';
import { ElectronBackendMessage, ElectronBackendConnectionPipe } from '../../electron-common/messaging/electron-backend-connection-handler';

export interface ElectronBackendConnectionOptions {
}

/**
 * Connection provider between the Theia frontend and the electron-main process via IPC.
 */
@injectable()
export class ElectronBackendConnectionProvider extends AbstractConnectionProvider<ElectronBackendConnectionOptions> {

    static createProxy<T extends object>(container: interfaces.Container, path: string, arg?: object): JsonRpcProxy<T> {
        return container.get(ElectronBackendConnectionProvider).createProxy<T>(path, arg);
    }

    constructor() {
        super();
        const usePipe = ElectronBackendConnectionPipe.onMessage('backend', message => {
            this.handleIncomingRawMessage(message);
        });
        // onMessage will return whether the electron main app wants to use the pipe for communication
        // If backend and electron app are distinct processes, we use normal process messaging
        if (!usePipe) {
            process.on('message', message => {
                if (ElectronBackendMessage.is(message)) {
                    this.handleIncomingRawMessage(ElectronBackendMessage.get(message));
                }
            });
        }
    }

    protected createChannel(id: number): WebSocketChannel {
        return new WebSocketChannel(id, content => {
            if (!ElectronBackendConnectionPipe.pushMessage('electron', content) && process.send) {
                process.send(ElectronBackendMessage.create(content));
            }
        });
    }
}
