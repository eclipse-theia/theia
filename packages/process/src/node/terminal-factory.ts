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

// import { Serializable } from '@theia/core';
import type { Terminal } from './terminal';

export interface TerminalOptions /* extends Serializable */ {

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
export interface TerminalSpawnOptions extends TerminalOptions {

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

/**
 * Options used to fork processes within `Terminal` instances.
 */
export interface TerminalForkOptions extends TerminalOptions {

    /**
     * The JavaScript script to run within the terminal.
     *
     * By default it will re-use the current Node runtime to fork the script as well as
     * copy over `process.execArgv` excluding any `--inspect[-brk]=...` arg.
     */
    modulePath: string

    /**
     * Defaults to `[]`.
     */
    arguments?: string[]

    /**
     * Path to the Node runtime to use.
     *
     * Defaults to `process.execPath`.
     */
    execPath?: string

    /**
     * Arguments to pass to the `execPath` executable.
     *
     * Defaults to `process.execArgv` without `--inspect[-brk]=...` arguments.
     */
    execArgv?: string[]
}

export const TerminalFactory = Symbol('TerminalFactory');
export interface TerminalFactory {

    spawn(options: TerminalSpawnOptions): Promise<Terminal>

    fork(options: TerminalForkOptions): Promise<Terminal>
}
