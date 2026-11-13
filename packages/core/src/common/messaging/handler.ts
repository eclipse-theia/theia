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

import { Channel } from '../message-rpc/channel.js';

export const servicesPath = '/services';

export const ConnectionHandler = Symbol('ConnectionHandler');

export interface ConnectionHandler {
    readonly path: string;
    /**
     * Whether the frontend may use the service before the process environment of the backend is complete.
     *
     * In an Electron application, the backend resolves the environment of the user's login shell after it has started
     * (see `ShellEnvironmentServer`). Until that is done, `process.env` lacks the `PATH` of the user's shell
     * configuration, so the processes that a service starts would not find the user's tools.
     * The backend therefore holds the opening of every service channel until the environment is known.
     * A service that starts no processes and that the frontend needs in order to start up declares its independence,
     * so that the workbench does not wait for the shell. The default is `false`.
     */
    readonly independentOfShellEnvironment?: boolean;
    onConnection(connection: Channel): void;
}
