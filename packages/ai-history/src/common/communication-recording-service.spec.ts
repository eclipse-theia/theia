// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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
import { ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { DefaultCommunicationRecordingService } from './communication-recording-service';
import { expect } from 'chai';

describe('DefaultCommunicationRecordingService', () => {

    it('records history', () => {
        const service = new DefaultCommunicationRecordingService();
        (service as unknown as { logger: ILogger }).logger = new MockLogger();
        service.recordRequest({ agentId: 'agent', requestId: '1', sessionId: '1', timestamp: 100, request: 'dummy request' });

        const history1 = service.getHistory('agent');
        expect(history1[0].request).to.eq('dummy request');

        service.recordResponse({ agentId: 'agent', requestId: '1', sessionId: '1', timestamp: 200, response: 'dummy response' });
        const history2 = service.getHistory('agent');
        expect(history2[0].request).to.eq('dummy request');
        expect(history2[0].response).to.eq('dummy response');
    });

    it('returns session history', () => {
        const service = new DefaultCommunicationRecordingService();
        (service as unknown as { logger: ILogger }).logger = new MockLogger();
        // some requests and responses for session 1
        service.recordRequest({ agentId: 'agent', requestId: '1', sessionId: '1', timestamp: 100, request: 'session 1 request 1' });
        service.recordResponse({ agentId: 'agent', requestId: '1', sessionId: '1', timestamp: 200, response: 'session 1 response 1' });
        service.recordRequest({ agentId: 'agent2', requestId: '2', sessionId: '1', timestamp: 100, request: 'session 1 request 2' });
        service.recordResponse({ agentId: 'agent2', requestId: '2', sessionId: '1', timestamp: 200, response: 'session 1 response 2' });
        // some requests and responses for session 2
        service.recordRequest({ agentId: 'agent', requestId: '3', sessionId: '2', timestamp: 100, request: 'different session request' });
        service.recordResponse({ agentId: 'agent', requestId: '3', sessionId: '2', timestamp: 200, response: 'different session request' });

        const history1 = service.getSessionHistory('1');
        expect(history1.length).to.eq(2);
        expect(history1[0].request).to.eq('session 1 request 1');
        expect(history1[0].response).to.eq('session 1 response 1');
        expect(history1[1].request).to.eq('session 1 request 2');
        expect(history1[1].response).to.eq('session 1 response 2');

        const history2 = service.getSessionHistory('2');
        expect(history2.length).to.eq(1);
        expect(history2[0].request).to.eq('different session request');
        expect(history2[0].response).to.eq('different session request');
    });

});
