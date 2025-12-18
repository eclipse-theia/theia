// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import { ChatAgentLocation } from './chat-agents';
import { MutableChatModel } from './chat-model';
import { ParsedChatRequest } from './parsed-chat-request';

describe('ChatRequestHierarchyBranchImpl', () => {

    function createParsedRequest(text: string): ParsedChatRequest {
        return {
            request: { text },
            parts: [{
                kind: 'text',
                text,
                promptText: text,
                range: { start: 0, endExclusive: text.length }
            }],
            toolRequests: new Map(),
            variables: []
        };
    }

    describe('remove()', () => {
        it('should not fire onDidChange when removing the last item from a branch', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            const request = model.addRequest(createParsedRequest('Single request'));
            request.response.complete();

            const branch = model.getBranch(request.id);
            expect(branch).to.not.be.undefined;

            let changeEventFired = false;
            model.onDidChange(event => {
                if (event.kind === 'changeHierarchyBranch') {
                    changeEventFired = true;
                }
            });

            branch!.remove(request);

            expect(changeEventFired).to.be.false;
            expect(branch!.items.length).to.equal(0);
        });

        it('should fire onDidChange when removing a non-last item from a branch', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            const request1 = model.addRequest(createParsedRequest('First request'));
            request1.response.complete();

            // Add second request as an alternative in the same branch
            const branch = model.getBranch(request1.id);
            expect(branch).to.not.be.undefined;
            const request2 = model.addRequest({
                ...createParsedRequest('Second request'),
                request: {
                    text: 'Second request',
                    referencedRequestId: request1.id
                }
            });
            request2.response.complete();

            let changeEventFired = false;
            model.onDidChange(event => {
                if (event.kind === 'changeHierarchyBranch') {
                    changeEventFired = true;
                }
            });

            branch!.remove(request1);

            expect(changeEventFired).to.be.true;
            expect(branch!.items.length).to.equal(1);
        });

        it('should set activeBranchIndex to -1 when branch becomes empty', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            const request = model.addRequest(createParsedRequest('Single request'));
            request.response.complete();

            const branch = model.getBranch(request.id);
            expect(branch).to.not.be.undefined;
            expect(branch!.activeBranchIndex).to.equal(0);

            branch!.remove(request);

            expect(branch!.activeBranchIndex).to.equal(-1);
            expect(branch!.items.length).to.equal(0);
        });

        it('should correctly adjust activeBranchIndex when removing item before active', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            const request1 = model.addRequest(createParsedRequest('First request'));
            request1.response.complete();

            // Add second request as an alternative in the same branch
            const branch = model.getBranch(request1.id);
            expect(branch).to.not.be.undefined;

            const request2 = model.addRequest({
                ...createParsedRequest('Second request'),
                request: {
                    text: 'Second request',
                    referencedRequestId: request1.id
                }
            });
            request2.response.complete();

            // After adding request2, it should be active (index 1)
            expect(branch!.activeBranchIndex).to.equal(1);

            branch!.remove(request1);

            // After removing request1 (index 0), active index should be adjusted to 0
            expect(branch!.activeBranchIndex).to.equal(0);
            expect(branch!.items.length).to.equal(1);
            expect(branch!.get().id).to.equal(request2.id);
        });
    });

    describe('get()', () => {
        it('should throw meaningful error when called on empty branch', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            const request = model.addRequest(createParsedRequest('Single request'));
            request.response.complete();

            const branch = model.getBranch(request.id);
            expect(branch).to.not.be.undefined;

            // Remove the request to make branch empty
            branch!.remove(request);
            expect(branch!.items.length).to.equal(0);

            // get() should throw meaningful error instead of crashing
            expect(() => branch!.get()).to.throw('Cannot get request from empty branch');
        });

        it('should return request when branch has items', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            const request = model.addRequest(createParsedRequest('Test request'));
            request.response.complete();

            const branch = model.getBranch(request.id);
            expect(branch).to.not.be.undefined;
            expect(branch!.items.length).to.equal(1);

            // get() should return the request
            expect(branch!.get().id).to.equal(request.id);
        });
    });
});
