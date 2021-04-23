/********************************************************************************
 * Copyright (C) 2021 MayStreet Inc. and others
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

import { inject, injectable, named } from 'inversify';
import { ContributionProvider, MaybePromise } from '../common';

import * as http from 'http';
import * as ws from 'ws';

/**
 * Bind components to this symbol to subscribe to WebSocket events WebSocket connections.
 */
export const WsLifecycleNotificationContribution = Symbol('WsLifecycleNotificationContribution');
export interface WsLifecycleNotificationContribution {
    /**
     * Return `false` to prevent the protocol upgrade from going through, blocking the WebSocket connection.
     *
     * @param request The HTTP connection upgrade request received by the server.
     * @param socket The WebSocket that the connection was upgraded to.
     */
    socketUpgraded(request: http.IncomingMessage, socket: ws): MaybePromise<void>;
}

/**
 * Central handler of `WsLifecycleNotificationContribution`.
 */
@injectable()
export class WsLifecycleNotifier {

    @inject(ContributionProvider) @named(WsLifecycleNotificationContribution)
    protected readonly wsLifecycleNotifiers: ContributionProvider<WsLifecycleNotificationContribution>;

    /**
     * Notifiy all the subscribed `WsLifecycleNotificationContributions` that the Websocket was upgraded.
     */
    async websocketWasUpgraded(request: http.IncomingMessage, socket: ws): Promise<void> {
        await Promise.all(Array.from(this.wsLifecycleNotifiers.getContributions(), async notifier => notifier.socketUpgraded(request, socket)));
    }
}
