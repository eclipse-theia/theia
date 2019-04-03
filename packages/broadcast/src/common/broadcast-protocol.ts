/********************************************************************************
 * Copyright (C) 2019 Progyan Bhattacharya
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

/** Interface for Broadcast Message State */
export const IBroadcastState = Symbol('IBroadcastState');

export type IBroadcastState = string | Object;

/** Interface for Broadcast Message Protocol */
export const IBroadcastProtocol = Symbol('IBroadcastProtocol');

export interface IBroadcastProtocol {
    prevState: IBroadcastState;
    state: IBroadcastState;
}

/** Interface for Broadcast Client */
export const IBroadcastClient = Symbol('IBroadcastClient');

export interface IBroadcastClient {
    onStateUpdate(event: IBroadcastProtocol): void;
}

/** Interface for Broadcast Server */
export const IBroadcastServer = Symbol('IBroadcastServer');

export interface IBroadcastServer {
    addClient(client: IBroadcastClient): void;
    removeClient(client: IBroadcastClient): void;
    setState(state: IBroadcastState): Promise<IBroadcastProtocol>;
    getState(): Promise<IBroadcastState>;
}

/** Interface for Broadcast Dispatcher Client */
export const IBroadcastClientDispatch = Symbol('IBroadcastClientDispatch');

export type onStateUpdateHandler = (event: IBroadcastProtocol) => void;

export interface IBroadcastClientDispatch {
    onStateUpdate(callback: onStateUpdateHandler): void;
    getState(): Promise<IBroadcastState>;
    setState(state: IBroadcastState): Promise<IBroadcastProtocol>;
}

/** API Endpoint for the Broadcast Service */
export const servicePath = '/services/broadcast';
