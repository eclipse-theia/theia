/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { MessageConnection } from 'vscode-jsonrpc';

import { WebSocketChannel } from '@theia/core/lib/common/messaging/web-socket-channel';

export interface ElectronMessagingService {
    /**
     * Accept a JSON-RPC connection on the given path.
     * A path supports the route syntax: https://github.com/rcs/route-parser#what-can-i-use-in-my-routes.
     */
    listen(path: string, callback: (params: ElectronMessagingService.PathParams, connection: MessageConnection) => void): void;
    /**
     * Accept an ipc channel on the given path.
     * A path supports the route syntax: https://github.com/rcs/route-parser#what-can-i-use-in-my-routes.
     */
    ipcChannel(path: string, callback: (params: ElectronMessagingService.PathParams, socket: WebSocketChannel) => void): void;
}
export namespace ElectronMessagingService {
    export interface PathParams {
        [name: string]: string
    }
    export const Contribution = Symbol('ElectronMessagingService.Contribution');
    export interface Contribution {
        configure(service: ElectronMessagingService): void;
    }
}
