// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
import { Event } from '@theia/core/lib/common/event';
import { WidgetOpenerOptions } from '@theia/core/lib/browser';
import { TerminalWidgetOptions, TerminalWidget } from './terminal-widget';

/**
 * Service manipulating terminal widgets.
 */
export const TerminalService = Symbol('TerminalService');
export interface TerminalService {

    /**
     * Create new terminal with predefined options.
     * @param options - terminal options.
     */
    newTerminal(options: TerminalWidgetOptions): Promise<TerminalWidget>;

    open(terminal: TerminalWidget, options?: WidgetOpenerOptions): void;

    readonly all: TerminalWidget[];

    /**
     * @param id - the widget id (NOT the terminal id!)
     * @return the widget
     */
    getById(id: string): TerminalWidget | undefined;

    /**
     * @param id - the terminal id (NOT the terminal widget id!)
     * @return the widget
     */
    getByTerminalId(terminalId: number): TerminalWidget | undefined;

    /**
     * Returns detected default shell.
     */
    getDefaultShell(): Promise<string>;

    readonly onDidCreateTerminal: Event<TerminalWidget>;

    readonly currentTerminal: TerminalWidget | undefined;

    readonly onDidChangeCurrentTerminal: Event<TerminalWidget | undefined>;

    readonly lastUsedTerminal: TerminalWidget | undefined;
}
