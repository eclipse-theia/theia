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

import type { Disposable } from '@theia/core';
import type { Readable } from 'stream';

export const TerminalBufferFactory = Symbol('TerminalBufferFactory');
export interface TerminalBufferFactory {
    (): TerminalBuffer
}

export interface TerminalBuffer {

    readonly readerCount: number

    /**
     * Push data into this buffer.
     */
    push(data: string): void

    /**
     * Mark the buffer as "closed", meaning no more data will be pushed to it.
     */
    close(): void

    /**
     * Get a stream that emits data starting from as far as is being stored.
     */
    getOutputStream(encoding?: string): Readable & Disposable
}
