
// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const ConnectionCloseService = Symbol('ConnectionCloseService');
export const connectionCloseServicePath = '/services/ChannelCloseService';

/**
 * These messages are used to negotiate service reconnection between a front ends and back end.
 * Whenever a front end first connects to a back end, it sends the ${@link ConnectionManagementMessages#INITIAL_CONNECT} message
 * together with its front end id.
 * The back end then starts a new front end connection context for that front end. If the back end already had another connection context
 * for the given front end id, it gets discarded.
 * If the front end reconnects after a websocket disconnect, it sends the ${@link ConnectionManagementMessages#RECONNECT} message
 * together with its front end id..
 * If the back end still has a connection context for the front end id, the context is reconnected and the back end replies with the value true.
 * If there is no context anymore, the back end replies with value false. The front end can then either do an initial connect or reload
 * the whole UI.
 */
export namespace ConnectionManagementMessages {
    export const INITIAL_CONNECT = 'initialConnection';
    export const RECONNECT = 'reconnect';
}

/**
 * A service to mark a front end as unused. As soon as it disconnects from the back end, the connection context will be discarded.
 */
export interface ConnectionCloseService {
    markForClose(frontEndId: string): Promise<void>;
}
