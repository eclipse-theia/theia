/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import type { Terminal } from './terminal';

export interface TerminalCommonOptions {

    /**
     * Working directory to spawn the process in.
     *
     * Defaults to the current working directory.
     */
    cwd?: string

    /**
     * Definitive map of environment variables to use when spawning the terminal.
     *
     * Will only set what is defined; it won't merge with anything else.
     *
     * Defaults to the current environment.
     */
    env?: Record<string, string>

    /**
     * Size of the terminal viewport in characters.
     *
     * Defaults to something?
     */
    size?: { cols?: number, rows?: number }
}

/**
 * Options used to spawn processes within `Terminal` instances.
 */
export interface TerminalSpawnOptions extends TerminalCommonOptions {

    /**
     * The executable to run within the terminal.
     *
     * Generic OS process resolution rules apply, this is not passed to a shell.
     */
    executable: string

    /**
     * Defaults to `[]`.
     */
    arguments?: string[]
}

// /**
//  * Options used to fork scripts within `Terminal` instances.
//  */
// export interface TerminalForkOptions extends TerminalCommonOptions {

//     /**
//      * Path of the JavaScript module to re-execute using `execPath`.
//      */
//     modulePath: string

//     /**
//      * Defaults to `[]`.
//      */
//     arguments?: string[]

//     /**
//      * Path of the JavaScript runtime to use to run `modulePath`.
//      *
//      * Defaults to the current `execPath`.
//      */
//     execPath?: string

//     /**
//      * Arguments to pass to `execPath` when running `modulePath`.
//      *
//      * Defaults to `[]`.
//      */
//     execArgv?: string[]
// }

// /**
//  * Options used to spawn a command through a shell.
//  */
// export interface TerminalShellOptions extends TerminalCommonOptions {

//     /**
//      * Path or name of the shell to use.
//      */
//     shellPath: string

//     /**
//      * Arguments to pass to the shell in order to invoke `commandLine`.
//      */
//     shellArgv: string[]

//     /**
//      * Command line to run through the shell.
//      */
//     commandLine: string
// }

export const TerminalFactory = Symbol('TerminalFactory');
export interface TerminalFactory {

    spawn(options: TerminalSpawnOptions): Promise<Terminal>

    // fork(options: TerminalForkOptions): Promise<Terminal>

    // shell(options: TerminalShellOptions): Promise<Terminal>
}
