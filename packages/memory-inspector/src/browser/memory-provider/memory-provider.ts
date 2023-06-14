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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { DebugVariable } from '@theia/debug/lib/browser/console/debug-console-items';
import { DebugSession } from '@theia/debug/lib/browser/debug-session';
import { DebugProtocol } from '@vscode/debugprotocol';
import { Interfaces } from '../utils/memory-widget-utils';
import { VariableRange } from '../utils/memory-widget-variable-utils';
import Long = require('long');

export const MemoryProvider = Symbol('MemoryProvider');
/**
 * Representation of a memory provider. It is only necessary to implement a new Memory Provider if the behavior of the Debug Adapter for a given session type
 * deviates from the Debug Adapter Protocol. Otherwise, the DefaultMemoryProvider should handle standard DAP requests and responses.
 *
 * Specific peculiarities that might require special handling include: restrictions on the formatting of memory location identifiers (only hex numbers, e.g.)
 * or deviations from the DAP in the format of the response to a given request.
 */
export interface MemoryProvider {
    /**
     * @param session
     * @return whether the given MemoryProvider can handle memory reading / writing for a session of the type submitted.
     */
    canHandle(session: DebugSession): boolean;
    readMemory(session: DebugSession, readMemoryArguments: DebugProtocol.ReadMemoryArguments): Promise<Interfaces.MemoryReadResult>;
    writeMemory?(session: DebugSession, writeMemoryArguments: DebugProtocol.WriteMemoryArguments): Promise<DebugProtocol.WriteMemoryResponse>;
    getLocals?(session: DebugSession): Promise<VariableRange[]>;
    /**
     * Whether the current debugger supports variable reference syntax (e.g. &a) in the `memoryReference` field of
     * @link DebugProtocol.ReadMemoryArguments, ReadMemoryArguments}
     */
    supportsVariableReferenceSyntax?(session: DebugSession, variable?: DebugVariable): boolean;
    formatVariableReference?(session: DebugSession, variable?: DebugVariable): string;
}

/**
 * Convert a base64-encoded string of bytes to the Uint8Array equivalent.
 */
export function base64ToBytes(base64: string): Interfaces.LabeledUint8Array {
    return Buffer.from(base64, 'base64');
}

@injectable()
export class DefaultMemoryProvider implements Required<MemoryProvider> {
    // This provider should only be used a fallback - it shouldn't volunteer to handle any session.
    canHandle(): false {
        return false;
    }

    async readMemory(session: DebugSession, readMemoryArguments: DebugProtocol.ReadMemoryArguments): Promise<Interfaces.MemoryReadResult> {
        console.log('Requesting memory with the following arguments:', readMemoryArguments);
        const result = await session.sendRequest('readMemory', readMemoryArguments) as DebugProtocol.ReadMemoryResponse;

        if (result.body?.data) {
            const { body: { data, address } } = result;
            const bytes = base64ToBytes(data);
            const longAddress = result.body.address.startsWith('0x') ? Long.fromString(address, true, 16) : Long.fromString(address, true, 10);
            return { bytes, address: longAddress };
        }
        throw new Error('Received no data from debug adapter.');
    }

    async writeMemory(session: DebugSession, writeMemoryArguments: DebugProtocol.WriteMemoryArguments): Promise<DebugProtocol.WriteMemoryResponse> {
        return session.sendRequest('writeMemory', writeMemoryArguments);
    }

    async getLocals(session: DebugSession): Promise<VariableRange[]> {
        return [];
    }

    supportsVariableReferenceSyntax(session: DebugSession, variable?: DebugVariable | undefined): boolean {
        return false;
    }

    formatVariableReference(session: DebugSession, variable?: DebugVariable | undefined): string {
        return '';
    }
}

@injectable()
export abstract class AbstractMemoryProvider implements Required<MemoryProvider> {
    @inject(DefaultMemoryProvider) protected readonly defaultProvider: DefaultMemoryProvider;

    abstract canHandle(session: DebugSession): boolean;

    readMemory(session: DebugSession, readMemoryArguments: DebugProtocol.ReadMemoryArguments): Promise<Interfaces.MemoryReadResult> {
        return this.defaultProvider.readMemory(session, readMemoryArguments);
    }

    writeMemory(session: DebugSession, writeMemoryArguments: DebugProtocol.WriteMemoryArguments): Promise<DebugProtocol.WriteMemoryResponse> {
        return this.defaultProvider.writeMemory(session, writeMemoryArguments);
    }

    getLocals(session: DebugSession): Promise<VariableRange[]> {
        return this.defaultProvider.getLocals(session);
    }

    supportsVariableReferenceSyntax(session: DebugSession, variable?: DebugVariable | undefined): boolean {
        return this.defaultProvider.supportsVariableReferenceSyntax(session, variable);
    }

    formatVariableReference(session: DebugSession, variable?: DebugVariable | undefined): string {
        return this.defaultProvider.formatVariableReference(session, variable);
    }
}
