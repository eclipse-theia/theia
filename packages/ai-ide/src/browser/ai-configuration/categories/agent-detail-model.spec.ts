// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { Agent } from '@theia/ai-core/lib/common';
import { AvailableGenericCapabilities } from '@theia/ai-chat-ui/lib/browser/generic-capabilities-service';
import { AgentDetailServices, loadAgentDetail } from './agent-detail-model';

disableJSDOM();

describe('loadAgentDetail', () => {
    const available: AvailableGenericCapabilities = {
        skills: [], mcpFunctions: [], functions: [], promptFragments: [], agentDelegation: [], variables: []
    };

    it('loads available and used capabilities concurrently for chat agents', async () => {
        let resolveAvailable!: (value: AvailableGenericCapabilities) => void;
        let markAvailableStarted!: () => void;
        const availableStarted = new Promise<void>(resolve => markAvailableStarted = resolve);
        const availableResult = new Promise<AvailableGenericCapabilities>(resolve => resolveAvailable = resolve);
        let usedStarted = false;
        const used = { functions: ['used-function'] };
        const services = {
            aiSettingsService: { getAgentSettings: async () => undefined },
            genericCapabilitiesService: {
                getAvailableCapabilities: (agentId: string) => {
                    expect(agentId).to.equal('coder');
                    markAvailableStarted();
                    return availableResult;
                }
            },
            chatCapabilitiesService: {
                getUsedGenericCapabilitiesForAgent: async (agentId: string) => {
                    expect(agentId).to.equal('coder');
                    usedStarted = true;
                    return used;
                }
            }
        } as unknown as AgentDetailServices;
        const agent = { id: 'coder', prompts: [], locations: [], invoke: async () => { } } as unknown as Agent;
        const loading = loadAgentDetail(agent, services);
        await availableStarted;
        try {
            expect(usedStarted).to.equal(true);
        } finally {
            resolveAvailable(available);
        }
        const loaded = await loading;
        expect(loaded.availableGenericCapabilities).to.equal(available);
        expect(loaded.usedGenericCapabilities).to.equal(used);
    });

    it('does not load generic capabilities for non-chat agents', async () => {
        const services = {
            aiSettingsService: { getAgentSettings: async () => undefined }
        } as unknown as AgentDetailServices;
        const agent = { id: 'completion', prompts: [] } as unknown as Agent;
        const loaded = await loadAgentDetail(agent, services);
        expect(loaded.availableGenericCapabilities).to.equal(undefined);
        expect(loaded.usedGenericCapabilities).to.equal(undefined);
    });
});
