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
import { ContributionProvider, MaybePromise } from '../../common';
import { Socket } from 'socket.io';

import * as http from 'http';

/**
 * Bind components to this symbol to subscribe to WebSocket events.
 */
export const MessagingListenerContribution = Symbol('MessagingListenerContribution');
export interface MessagingListenerContribution {
    /**
     * Function invoked when a HTTP connection is upgraded to a websocket.
     *
     * @param request The HTTP connection upgrade request received by the server.
     * @param socket The WebSocket that the connection was upgraded to.
     */
    onDidWebSocketUpgrade(request: http.IncomingMessage, socket: Socket): MaybePromise<void>;
}

/**
 * Handler of Theia messaging system events, dispatching to MessagingListenerContribution instances.
 */
@injectable()
export class MessagingListener {

    @inject(ContributionProvider) @named(MessagingListenerContribution)
    protected readonly messagingListenerContributions: ContributionProvider<MessagingListenerContribution>;

    /**
     * Notify all the subscribed `MessagingListenerContribution`s that the Websocket was upgraded.
     */
    async onDidWebSocketUpgrade(request: http.IncomingMessage, socket: Socket): Promise<void> {
        await Promise.all(Array.from(this.messagingListenerContributions.getContributions(), async messagingListener => messagingListener.onDidWebSocketUpgrade(request, socket)));
    }
}
