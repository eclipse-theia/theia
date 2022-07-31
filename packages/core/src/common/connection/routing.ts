// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Connection } from './connection';
import { Broker, Handler, Router } from '../routing';
import { serviceIdentifier } from '../types';

/**
 * Get or create outgoing connections.
 */
export const ConnectionProvider = serviceIdentifier<ConnectionProvider<any, any>>('ConnectionProvider');
export interface ConnectionProvider<T extends Connection<any>, P extends object = any> {
    open(params: P): T
}

export const ConnectionRouter = serviceIdentifier<ConnectionRouter>('ConnectionRouter');
export type ConnectionRouter = Router<Connection<any>>;

export const ConnectionHandler = serviceIdentifier<ConnectionHandler>('ConnectionHandler');
export type ConnectionHandler<T = any, P extends object = any> = Handler<Connection<T>, P>;

export const ConnectionEmitter = serviceIdentifier<ConnectionEmitter>('ConnectionEmitter');
export type ConnectionEmitter = Broker<Connection<any>>;
