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

import type { Event, Disposable } from '@theia/core';
import type { Readable } from 'stream';

export type TerminalDataEvent = string;

/**
 * Only one of `code` and `signal` should be set.
 */
export interface TerminalExitEvent {
    readonly code?: number | null
    readonly signal?: string | null
}

/**
 * Informations about the underlying process.
 */
export interface TerminalProcessInfo {

    /**
     * The underlying process id.
     */
    readonly pid: number

    /**
     * The underlying process executable path, or just its name.
     */
    readonly executable: string

    /**
     * The underlying process arguments.
     */
    readonly arguments: string[]

    /**
     * The underlying process working directory. This is the value set at creation.
     */
    readonly cwd: string

    /**
     * The underlying process environment. This is the value set at creation.
     */
    readonly env: Readonly<Record<string, string>>
}

/**
 * A terminal is not a shell.
 *
 * Terminals are special entities that handle processes. Such
 * processes can be a shell, but it can also be a normal process.
 */
export interface Terminal {

    /**
     * Internal tracking id, this is not the OS PID.
     */
    readonly _id: number

    /**
     * Info about the running underlying process.
     */
    readonly info: TerminalProcessInfo

    /**
     * Undefined until the process exits.
     */
    readonly exitStatus?: TerminalExitEvent

    /**
     * Output coming out of the terminal. Not line-based.
     *
     * See `getReader` to read the output from the beginning.
     */
    readonly onData: Event<TerminalDataEvent>

    /**
     * Fires once the underlying process exits.
     *
     * The data channel may or may not be closed at this point.
     */
    readonly onExit: Event<TerminalExitEvent>

    /**
     * Fires once the underlying process has exited and the data channel is closed.
     */
    readonly onClose: Event<TerminalExitEvent>

    /**
     * @param data send through `Terminal` to the underlying process stdin channel
     */
    write(data: string): void

    /**
     * Get a `Readable` stream that replays the output from the beginning.
     *
     * Terminal output is usually buffered/stored in order to read it back later.
     */
    getOutputStream(): Readable & Disposable

    /**
     * @param cols width in characters
     * @param rows height in characters
     */
    resize(cols: number, rows: number): void

    /**
     * Kill this `Terminal` underlying process.
     */
    kill(): void
}
