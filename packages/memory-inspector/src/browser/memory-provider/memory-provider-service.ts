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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { ContributionProvider } from '@theia/core';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { DebugVariable } from '@theia/debug/lib/browser/console/debug-console-items';
import { DebugSession } from '@theia/debug/lib/browser/debug-session';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { DebugProtocol } from '@vscode/debugprotocol';
import { Interfaces } from '../utils/memory-widget-utils';
import { VariableRange } from '../utils/memory-widget-variable-utils';
import { DefaultMemoryProvider, MemoryProvider } from './memory-provider';
import { nls } from '@theia/core/lib/common/nls';

@injectable()
export class MemoryProviderService {
    @inject(DebugSessionManager) protected readonly sessionManager: DebugSessionManager;
    @inject(DefaultMemoryProvider) protected readonly defaultProvider: DefaultMemoryProvider;
    @inject(ContributionProvider) @named(MemoryProvider)
    protected readonly contributions: ContributionProvider<MemoryProvider>;

    readMemory(readMemoryArguments: DebugProtocol.ReadMemoryArguments): Promise<Interfaces.MemoryReadResult> {
        const readError = nls.localize('theia/memory-inspector/provider/readError', 'Cannot read memory. No active debug session.');
        const session = this.getSession(readError);
        if (!session.capabilities.supportsReadMemoryRequest) {
            throw new Error('Cannot read memory. The current session does not support the request.');
        }
        const provider = this.getProvider(session);
        return provider.readMemory(session, readMemoryArguments);
    }

    writeMemory(writeMemoryArguments: DebugProtocol.WriteMemoryArguments): Promise<DebugProtocol.WriteMemoryResponse> {
        const writeError = nls.localize('theia/memory-inspector/provider/writeError', 'Cannot write memory. No active debug session.');
        const session = this.getSession(writeError);
        if (!session.capabilities.supportsWriteMemoryRequest) {
            throw new Error('Cannot write memory. The current session does not support the request.');
        }
        const provider = this.getProvider(session, 'writeMemory');

        return provider.writeMemory(session, writeMemoryArguments);
    }

    getLocals(): Promise<VariableRange[]> {
        const localsError = nls.localize('theia/memory-inspector/provider/localsError', 'Cannot read local variables. No active debug session.');
        const session = this.getSession(localsError);
        const provider = this.getProvider(session, 'getLocals');
        return provider.getLocals(session);
    }

    supportsVariableReferenceSyntax(variable?: DebugVariable): boolean {
        if (!this.sessionManager.currentSession) { return false; }
        const provider = this.getProvider(this.sessionManager.currentSession, 'supportsVariableReferenceSyntax');
        return provider.supportsVariableReferenceSyntax(this.sessionManager.currentSession, variable);
    }

    formatVariableReference(variable?: DebugVariable): string {
        if (!this.sessionManager.currentSession) { return ''; }
        const provider = this.getProvider(this.sessionManager.currentSession, 'formatVariableReference');
        return provider.formatVariableReference(this.sessionManager.currentSession, variable);
    }

    /** @throws with {@link message} if there is no active debug session. */
    protected getSession(message: string): DebugSession {
        if (this.sessionManager.currentSession) { return this.sessionManager.currentSession; }
        throw new Error(message);
    }

    protected getProvider(session: DebugSession, ensure?: keyof MemoryProvider): Required<MemoryProvider> {
        return this.contributions.getContributions()
            .find((candidate): candidate is Required<MemoryProvider> => Boolean(!ensure || candidate[ensure]) && candidate.canHandle(session))
            ?? this.defaultProvider;
    }
}
