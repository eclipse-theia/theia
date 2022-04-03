// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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

import { Disposable, Event, serviceIdentifier, servicePath } from '@theia/core';
import Route = require('@theia/core/shared/route-parser');
import { IBaseTerminalServer, IBaseTerminalServerOptions } from './base-terminal-protocol';

export const ITerminalServer = serviceIdentifier<ITerminalServer>('ITerminalServer');
export const terminalPath = servicePath<ITerminalServer>('/services/terminal');

export const REMOTE_TERMINAL_ROUTE = new Route<{ terminalId: string }>('/services/terminals/:terminalId');

export interface ITerminalServer extends IBaseTerminalServer {
    create(ITerminalServerOptions: object): Promise<number>;
}

export interface ITerminalServerOptions extends IBaseTerminalServerOptions {
    command: string,
    args?: string[],
    options?: object
}

export const RemoteTerminalFactory = serviceIdentifier<RemoteTerminalFactory>('RemoteTerminalFactory');
export type RemoteTerminalFactory = (terminalId: number) => RemoteTerminal;

export interface RemoteTerminal extends Disposable {
    onData: Event<string>
    write(data: string): void
}
