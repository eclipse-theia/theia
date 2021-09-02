/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { Interfaces } from '../utils/memory-widget-utils';
import { injectable } from '@theia/core/shared/inversify';
import { hexStrToUnsignedLong } from '../../common/util';
import { MemoryProvider } from './memory-provider';
import { DebugSession } from '@theia/debug/lib/browser/debug-session';
import { DebugProtocol } from 'vscode-debugprotocol';

/**
 * Convert a hex-encoded string of bytes to the Uint8Array equivalent.
 */
export function hex2bytes(hex: string): Interfaces.LabeledUint8Array {
    const arr: Interfaces.LabeledUint8Array = new Uint8Array(hex.length / 2);

    for (let i = 0; i < hex.length / 2; i++) {
        const hexByte = hex.slice(i * 2, i * 2 + 2);
        const byte = parseInt(hexByte, 16);
        arr[i] = byte;
    }

    return arr;
}

/**
 * Read memory through the current debug session, using the cdt-gdb-adapter
 * extension to read memory.
 */
@injectable()
export class CDTGDBMemoryProvider implements MemoryProvider {

    canHandle(session: DebugSession): boolean {
        return session.configuration.type === 'gdb';
    }

    async readMemory(session: DebugSession, readMemoryArguments: DebugProtocol.ReadMemoryArguments): Promise<Interfaces.MemoryReadResult> {
        // @ts-ignore /* Theia 1.17.0 will include the readMemoryRequest in its types. Until then, we can send the request anyway */
        const result = await session.sendRequest('readMemory', readMemoryArguments) as DebugProtocol.ReadMemoryResponse;

        if (result.body?.data) {
            const bytes = hex2bytes(result.body.data);
            const address = hexStrToUnsignedLong(result.body.address);
            return { bytes, address };
        }
        throw new Error('Received no data from debug adapter.');
    }
}
