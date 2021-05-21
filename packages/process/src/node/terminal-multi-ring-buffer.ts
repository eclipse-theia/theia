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

import { Disposable } from '@theia/core/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Readable } from 'stream';
import { MultiRingBuffer } from './multi-ring-buffer';
import { TerminalBuffer } from './terminal-buffer';

/**
 * Wrapper around the original `MultiRingBuffer` implementation to fit the internal `TerminalBuffer` API.
 */
@injectable()
export class TerminalMultiRingBuffer implements TerminalBuffer {

    @inject(MultiRingBuffer)
    protected ringBuffer: MultiRingBuffer;

    get readerCount(): number {
        return this.ringBuffer.readersSize();
    }

    push(data: string): void {
        this.ringBuffer.enq(data);
    }

    getOutputStream(encoding?: string): Readable & Disposable {
        return this.ringBuffer.getStream(encoding);
    }

    close(): void {
        this.ringBuffer.dispose();
    }
}
