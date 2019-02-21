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

// import { injectable } from 'inversify';
import { TerminalWidget } from '@theia/terminal/src/browser/terminal-widget';

/**
 * TerminalClient contains connection logic between terminal server side and terminal widget. So it's incupsulated connection
 * specific logic in the separated code layer. Terminal widget responsible to render backend output and catch user input. Terminal client
 * responcible to create connection with backend, send output to the terminal widget, and send user input from terminal widget.
 * Terminal client should create connection with terminal server side and send user input from terminal widget to the terminal backend, move
 * terminal output from terminal backend to the terminal widget. Potentionally terminal backend could be separed service isolated of Theia.
 * This interface provide extensibility terminal wiget and terminal server side. This common interface allow to use different implementation
 * terminal widget for the same terminal backend. Also it's allow to reuse current terminal widget to comunication with some custom server side.
 */
export interface TerminalClient {

    /**
     * Create connection with terminal backend and return connection id.
     */
    createConnection(terminlaWidget: TerminalWidget): Promise<string>;

    // onSessionIdChanged - for reconnection stuff, but need to think about it.

    resize(): Promise <void>;

    kill(): Promise<string>;

    sendText(text: string): Promise<void>

    // define iterceptor function, but like optional argument.
}

// todo move implementation to the separated ts file.
/**
 * Default implementation Terminal Client.
 */
// @injectable()
export class DefaultTerminalClient implements TerminalClient {

    private termWidget: TerminalWidget;

    createConnection(terminalWidget: TerminalWidget): Promise<string> {
        this.termWidget = terminalWidget;
        throw new Error('Method not implemented.');
    }

    resize(): Promise<void> {
        throw new Error('Method not implemented.');
    }

    kill(): Promise<string> {
        throw new Error('Method not implemented.');
    }

    sendText(text: string): Promise<void> {
        this.termWidget.sendText(text);
        throw new Error('Method not implemented.');
    }
}
