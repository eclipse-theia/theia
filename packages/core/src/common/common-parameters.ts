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

import { Parameter } from './parameter';

/**
 * Parameter used when opening new connections.
 *
 * Used to identify the target service to handle the connection.
 */
export const ConnectionPath = new Parameter<string>('THEIA_CONNECTION_PATH', {
    validator: value => typeof value === 'string'
});

/**
 * @internal
 *
 * Parameter used when opening new connections.
 *
 * Used to identify the frontend and find the appropriate services.
 */
export const FrontendId = new Parameter<string>('THEIA_FRONTEND_ID', {
    validator: value => typeof value === 'string'
});

/**
 * @internal
 *
 * Parameter used when opening connections.
 *
 * Used to identify connections for the reconnection mechanism.
 */
export const ConnectionId = new Parameter<string>('THEIA_CONNECTION_ID', {
    validator: value => typeof value === 'string'
});
