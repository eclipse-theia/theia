// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

export const ExternalTerminalService = Symbol('ExternalTerminalService');
export const externalTerminalServicePath = '/services/external-terminal';

/**
 * Represents the external terminal configuration options.
 */
export interface ExternalTerminalConfiguration {
    /**
     * The external terminal executable for Windows.
     */
    'terminal.external.windowsExec': string;
    /**
     * The external terminal executable for OSX.
     */
    'terminal.external.osxExec': string;
    /**
     * The external terminal executable for Linux.
     */
    'terminal.external.linuxExec': string;
}

export interface ExternalTerminalService {

    /**
     * Open a native terminal in the designated working directory.
     *
     * @param configuration the configuration for opening external terminals.
     * @param cwd the string URI of the current working directory where the terminal should open from.
     */
    openTerminal(configuration: ExternalTerminalConfiguration, cwd: string): Promise<void>;

    /**
     * Get the default executable.
     *
     * @returns the default terminal executable.
     */
    getDefaultExec(): Promise<string>;

}
