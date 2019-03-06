/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { IShellTerminalServerOptions } from '../common/shell-terminal-protocol';
import { Disposable } from '@theia/core';

import { TerminalWidget } from './';

export type TerminalClientFactory = (options: TerminalClientOptions, terminalWidget: TerminalWidget) => TerminalClient;
export const TerminalClientFactory = Symbol('TerminalClientFactory');

/**
 * TerminalClient contains connection logic between terminal server side and terminal widget. So it's incupsulated connection
 * specific logic in the separated code layer. Terminal widget responsible to render backend output and catch user input. Terminal client
 * responcible to create connection with backend, send output to the terminal widget, and send user input from terminal widget.
 * Terminal client should create connection with terminal server side and send user input from terminal widget to the terminal backend, move
 * terminal output from terminal backend to the terminal widget. Potentionally terminal backend could be separed service isolated of Theia.
 * This interface provide extensibility terminal wiget and terminal server side. This common interface allow to use different implementation
 * terminal widget for the same terminal backend. Also it's allow to reuse current terminal widget to comunication with some custom server side.
 */
export const TerminalClient = Symbol('TerminalClient');
export interface TerminalClient extends Disposable {

    /**
     * Terminal client options to setup server side terminal process
     * and control terminal client configuration.
     */
    readonly options: TerminalClientOptions;

    readonly widget: TerminalWidget;

    readonly terminalId: number;

    readonly processId: Promise<number>

    /**
     * Create connection with terminal backend and return connection id.
     */
    create(): Promise<number>;

    attach(connectionId: number, createNewTerminalOnFail?: boolean): Promise<number>;

    resize(cols: number, rows: number): void;

    kill(): Promise<void>;

    sendText(text: string): Promise<void>;

}

export const TerminalClientOptions = Symbol('TerminalClientOptions');
export interface TerminalClientOptions extends Partial<IShellTerminalServerOptions> {
    readonly closeOnDispose?: boolean;

}
