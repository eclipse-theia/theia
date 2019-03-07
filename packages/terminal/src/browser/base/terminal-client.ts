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

import { IShellTerminalServerOptions } from '../../common/shell-terminal-protocol';
import { Disposable } from '@theia/core';
import { TerminalWidget } from './terminal-widget';

export type TerminalClientFactory = (options: TerminalClientOptions, terminalWidget: TerminalWidget) => TerminalClient;
export const TerminalClientFactory = Symbol('TerminalClientFactory');

/**
 * TerminalClient contains connection logic between terminal server side and terminal widget.
 * So it's incupsulated connection specific logic in the separated code layer.
 * Terminal client is responcible:
 * - create new terminal process;
 * - attach to the already running process on the backend(in case if backend support it);
 * - create connection with backend process;
 * - send output to the terminal widget from backend;
 * - send user input from terminal widget to the backend.
 * - kill backend process(in case if backend support it);
 * - resize backend output frame(in case if backend support it);
 */
export const TerminalClient = Symbol('TerminalClient');
export interface TerminalClient extends Disposable {

    /**
     * Terminal client options to setup backend terminal process
     * and control terminal client configuration.
     */
    readonly options: TerminalClientOptions;

    /**
     * Terminal widget which is under TerminalClient control.
     */
    readonly widget: TerminalWidget;

    /**
     * Return unique backend terminal process id(Notice: it's not a PID, it's backend id to count running processes).
     */
    readonly terminalId: number;

    /**
     * Return unique process id(PID).
     */
    readonly processId: Promise<number>

    /**
     * Create new process and attach terminal widget to this process.
     */
    createAndAttach(): Promise<number>;

    /**
     * Attach to already running process.
     * @param terminalId - unique process backend id(it's not PID, it's backend id to count runnting processes).
     * @param createNewTerminalOnFaill - spawn new process in case if
     * target process was not found by terminalId or it's gone. NOTICE: False by default.
     */
    attach(terminalId: number, createNewTerminalOnFail?: boolean): Promise<number>;

    /**
     * Resize terminal process on the backend side.
     * @param cols amount displayed colums.
     * @param rows amount displayed rows.
     */
    resize(cols: number, rows: number): Promise<void>;

    /**
     * Kill backend process.
     */
    kill(): Promise<void>;

    /**
     * Send input to the backend process.
     * @param text - content to send.
     */
    sendText(text: string): Promise<void>;
}

/**
 * Terminal client options.
 */
export const TerminalClientOptions = Symbol('TerminalClientOptions');
export interface TerminalClientOptions extends Partial<IShellTerminalServerOptions> {
    // Kill backend process in case if user manually closed TerminalWidget. NOTICE: False by default.
    readonly closeOnDispose?: boolean;
}
