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

import { ContributionProvider } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { DebugProtocol } from 'vscode-debugprotocol';
import { Interfaces } from '../utils/memory-widget-utils';
import { MemoryProvider, DefaultMemoryProvider } from './memory-provider';

@injectable()
export class MemoryProviderService {
    @inject(DebugSessionManager) protected readonly sessionManager: DebugSessionManager;
    @inject(DefaultMemoryProvider) protected readonly defaultProvider: DefaultMemoryProvider;
    @inject(ContributionProvider) @named(MemoryProvider)
    protected readonly contributions: ContributionProvider<MemoryProvider>;

    readMemory(readMemoryArguments: DebugProtocol.ReadMemoryArguments): Promise<Interfaces.MemoryReadResult> {
        const session = this.sessionManager.currentSession;
        if (!session) {
            throw new Error('Cannot read memory. No active debug session.');
        }
        if (!session.capabilities.supportsReadMemoryRequest) {
            throw new Error('Cannot read memory. The current session does not support the request.');
        }
        const provider = this.contributions.getContributions().find(candidate => candidate.canHandle(session)) ?? this.defaultProvider;
        return provider.readMemory(session, readMemoryArguments);
    }

    writeMemory(writeMemoryArguments: DebugProtocol.WriteMemoryArguments): Promise<DebugProtocol.WriteMemoryResponse> {
        const session = this.sessionManager.currentSession;
        if (!session) {
            throw new Error('Cannot write memory. No active debug session.');
        }
        if (!session.capabilities.supportsWriteMemoryRequest) {
            throw new Error('Cannot write memory. The current session does not support the request.');
        }
        const provider: Required<MemoryProvider> = this.contributions.getContributions()
            .find((candidate): candidate is Required<MemoryProvider> => !!candidate.writeMemory && candidate.canHandle(session))
            ?? this.defaultProvider;

        return provider.writeMemory(session, writeMemoryArguments);
    }
}
