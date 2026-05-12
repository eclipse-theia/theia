// *****************************************************************************
// Copyright (C) 2026 Ericsson and Others.
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

import { expect } from 'chai';
import { Emitter } from '@theia/core';
import { AgentSessionHookData, AgentSessionHookProvider } from './agent-session-hooks';
import { AgentSessionHookRegistryImpl } from './agent-session-hooks-impl';

describe('AgentSessionHookRegistryImpl', () => {

    function createProvider(id: string): AgentSessionHookProvider & { fire: (data: AgentSessionHookData) => void } {
        const emitter = new Emitter<AgentSessionHookData>();
        return { id, onHookEvent: emitter.event, fire: data => emitter.fire(data) };
    }

    it('should forward events from a single provider', () => {
        const provider = createProvider('test');
        const registry = new AgentSessionHookRegistryImpl();
        (registry as any).providers = { getContributions: () => [provider] };
        registry['init']();

        const received: AgentSessionHookData[] = [];
        registry.onHookEvent(e => received.push(e));

        provider.fire({ event: 'SessionStart', sessionId: 's1' });
        expect(received).to.have.length(1);
        expect(received[0].event).to.equal('SessionStart');
        expect(received[0].sessionId).to.equal('s1');
    });

    it('should aggregate events from multiple providers', () => {
        const p1 = createProvider('claude-code');
        const p2 = createProvider('ollama');
        const registry = new AgentSessionHookRegistryImpl();
        (registry as any).providers = { getContributions: () => [p1, p2] };
        registry['init']();

        const received: AgentSessionHookData[] = [];
        registry.onHookEvent(e => received.push(e));

        p1.fire({ event: 'PreToolUse', sessionId: 's1', toolName: 'Bash' });
        p2.fire({ event: 'PostToolUse', sessionId: 's2', toolName: 'read_file' });

        expect(received).to.have.length(2);
        expect(received[0].event).to.equal('PreToolUse');
        expect(received[1].event).to.equal('PostToolUse');
    });

    it('should pass tool metadata through', () => {
        const provider = createProvider('test');
        const registry = new AgentSessionHookRegistryImpl();
        (registry as any).providers = { getContributions: () => [provider] };
        registry['init']();

        const received: AgentSessionHookData[] = [];
        registry.onHookEvent(e => received.push(e));

        provider.fire({
            event: 'PostToolUse',
            sessionId: 's1',
            toolName: 'Write',
            toolInput: { file_path: 'src/index.ts' }
        });

        expect(received[0].toolName).to.equal('Write');
        expect(received[0].toolInput).to.deep.equal({ file_path: 'src/index.ts' });
    });

    it('should handle provider with no events fired', () => {
        const provider = createProvider('silent');
        const registry = new AgentSessionHookRegistryImpl();
        (registry as any).providers = { getContributions: () => [provider] };
        registry['init']();

        const received: AgentSessionHookData[] = [];
        registry.onHookEvent(e => received.push(e));

        expect(received).to.have.length(0);
    });

    it('should pass payload through', () => {
        const provider = createProvider('test');
        const registry = new AgentSessionHookRegistryImpl();
        (registry as any).providers = { getContributions: () => [provider] };
        registry['init']();

        const received: AgentSessionHookData[] = [];
        registry.onHookEvent(e => received.push(e));

        provider.fire({
            event: 'Notification',
            sessionId: 's1',
            payload: { message: 'Task complete', type: 'info' }
        });

        expect(received[0].payload).to.deep.equal({ message: 'Task complete', type: 'info' });
    });

    it('should support all P1-P3 event types', () => {
        const provider = createProvider('test');
        const registry = new AgentSessionHookRegistryImpl();
        (registry as any).providers = { getContributions: () => [provider] };
        registry['init']();

        const received: AgentSessionHookData[] = [];
        registry.onHookEvent(e => received.push(e));

        const allEvents: AgentSessionHookData['event'][] = [
            'SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse',
            'PostToolUseFailure', 'PostToolBatch', 'UserPromptSubmit',
            'PermissionRequest', 'PermissionDenied', 'InstructionsLoaded',
            'ConfigChange', 'Notification', 'Stop', 'StopFailure',
            'Setup', 'SubagentStart', 'SubagentStop',
            'TaskCreated', 'TaskCompleted', 'TeammateIdle'
        ];

        for (const event of allEvents) {
            provider.fire({ event, sessionId: 's1' });
        }

        expect(received).to.have.length(allEvents.length);
        expect(received.map(e => e.event)).to.deep.equal(allEvents);
    });
});
