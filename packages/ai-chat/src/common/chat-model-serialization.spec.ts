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

describe('ChatModel Serialization and Restoration', () => {

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

    describe('Simple tree serialization', () => {
        it('should serialize a chat with a single request', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            model.addRequest(createParsedRequest('Hello'));

            const serialized = model.toSerializable();

            expect(serialized.hierarchy).to.be.an('object');
            expect(serialized.hierarchy!.rootBranchId).to.be.a('string');
            expect(serialized.hierarchy!.branches).to.be.an('object');
            expect(serialized.requests).to.have.lengthOf(1);
            expect(serialized.requests[0].text).to.equal('Hello');
        });

        it('should serialize a chat with multiple sequential requests', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);
            model.addRequest(createParsedRequest('First'));
            model.addRequest(createParsedRequest('Second'));
            model.addRequest(createParsedRequest('Third'));

            const serialized = model.toSerializable();

            expect(serialized.hierarchy).to.be.an('object');
            expect(serialized.requests).to.have.lengthOf(3);

            // Verify the hierarchy has 3 branches (one for each request)
            const branches = Object.values(serialized.hierarchy!.branches);
            expect(branches).to.have.lengthOf(3);

            // Verify the active path through the tree
            const rootBranch = serialized.hierarchy!.branches[serialized.hierarchy!.rootBranchId];
            expect(rootBranch.items).to.have.lengthOf(1);
            expect(rootBranch.items[0].requestId).to.equal(serialized.requests[0].id);
            expect(rootBranch.items[0].nextBranchId).to.be.a('string');
        });
    });

    describe('Tree serialization with alternatives (edited messages)', () => {
        it('should serialize a chat with edited messages', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);

            // Add first request
            const req1 = model.addRequest(createParsedRequest('Original message'));
            req1.response.complete();

            // Add second request
            model.addRequest(createParsedRequest('Follow-up'));

            // Edit the first request (creating an alternative)
            const branch1 = model.getBranch(req1.id);
            expect(branch1).to.not.be.undefined;
            branch1!.add(model.addRequest(createParsedRequest('Edited message'), 'agent-1'));

            const serialized = model.toSerializable();

            // Should have 3 requests: original, edited, and follow-up
            expect(serialized.requests).to.have.lengthOf(3);

            // The root branch should have 2 items (original and edited alternatives)
            const rootBranch = serialized.hierarchy!.branches[serialized.hierarchy!.rootBranchId];
            expect(rootBranch.items).to.have.lengthOf(2);
            expect(rootBranch.items[0].requestId).to.equal(serialized.requests[0].id);
            expect(rootBranch.items[1].requestId).to.equal(serialized.requests[2].id);

            // The active branch index should point to the most recent alternative
            expect(rootBranch.activeBranchIndex).to.be.at.least(0);
        });

        it('should serialize nested alternatives (edited multiple times)', () => {
            const model = new MutableChatModel(ChatAgentLocation.Panel);

            // Add first request
            const req1 = model.addRequest(createParsedRequest('First'));
            req1.response.complete();

            // Add second request
            const req2 = model.addRequest(createParsedRequest('Second'));
            req2.response.complete();

            // Edit the second request (creating an alternative)
            const branch2 = model.getBranch(req2.id);
            expect(branch2).to.not.be.undefined;
            const req2edited = model.addRequest(createParsedRequest('Second (edited)'), 'agent-1');
            branch2!.add(req2edited);

            // Add third request after the edited version
            model.addRequest(createParsedRequest('Third'));

            const serialized = model.toSerializable();

            // Should have 4 requests total
            expect(serialized.requests).to.have.lengthOf(4);

            // Find the second-level branch
            const rootBranch = serialized.hierarchy!.branches[serialized.hierarchy!.rootBranchId];
            const nextBranchId = rootBranch.items[rootBranch.activeBranchIndex].nextBranchId;
            expect(nextBranchId).to.be.a('string');

            const secondBranch = serialized.hierarchy!.branches[nextBranchId!];
            expect(secondBranch.items).to.have.lengthOf(2); // Original and edited
        });
    });

    describe('Tree restoration from serialized data', () => {
        it('should restore a simple chat session', () => {
            // Create and serialize
            const model1 = new MutableChatModel(ChatAgentLocation.Panel);
            model1.addRequest(createParsedRequest('Hello'));
            const serialized = model1.toSerializable();

            // Restore
            const model2 = new MutableChatModel(serialized);

            expect(model2.getRequests()).to.have.lengthOf(1);
            expect(model2.getRequests()[0].request.text).to.equal('Hello');
        });

        it('should restore chat with multiple sequential requests', () => {
            // Create and serialize
            const model1 = new MutableChatModel(ChatAgentLocation.Panel);
            model1.addRequest(createParsedRequest('First'));
            model1.addRequest(createParsedRequest('Second'));
            model1.addRequest(createParsedRequest('Third'));
            const serialized = model1.toSerializable();

            // Restore
            const model2 = new MutableChatModel(serialized);

            const requests = model2.getRequests();
            expect(requests).to.have.lengthOf(3);
            expect(requests[0].request.text).to.equal('First');
            expect(requests[1].request.text).to.equal('Second');
            expect(requests[2].request.text).to.equal('Third');
        });

        it('should restore chat with edited messages (alternatives)', () => {
            // Create and serialize
            const model1 = new MutableChatModel(ChatAgentLocation.Panel);
            const req1 = model1.addRequest(createParsedRequest('Original'));
            req1.response.complete();

            const branch1 = model1.getBranch(req1.id);
            const req1edited = model1.addRequest(createParsedRequest('Edited'), 'agent-1');
            branch1!.add(req1edited);

            const serialized = model1.toSerializable();

            // Verify serialization includes both alternatives
            expect(serialized.requests).to.have.lengthOf(2);

            // Restore
            const model2 = new MutableChatModel(serialized);

            // Check that both alternatives are restored
            const restoredBranch = model2.getBranch(serialized.requests[0].id);
            expect(restoredBranch).to.not.be.undefined;
            expect(restoredBranch!.items).to.have.lengthOf(2);
            expect(restoredBranch!.items[0].element.request.text).to.equal('Original');
            expect(restoredBranch!.items[1].element.request.text).to.equal('Edited');
        });

        it('should restore the correct active branch indices', () => {
            // Create and serialize
            const model1 = new MutableChatModel(ChatAgentLocation.Panel);
            const req1 = model1.addRequest(createParsedRequest('Original'));
            req1.response.complete();

            const branch1 = model1.getBranch(req1.id);
            const req1edited = model1.addRequest(createParsedRequest('Edited'), 'agent-1');
            branch1!.add(req1edited);

            // Switch to the edited version
            branch1!.enable(req1edited);

            const activeBranchIndex1 = branch1!.activeBranchIndex;
            const serialized = model1.toSerializable();

            // Restore
            const model2 = new MutableChatModel(serialized);

            const restoredBranch = model2.getBranch(serialized.requests[0].id);
            expect(restoredBranch).to.not.be.undefined;
            expect(restoredBranch!.activeBranchIndex).to.equal(activeBranchIndex1);
        });

        it('should restore a simple session with hierarchy', () => {
            // Create serialized data with hierarchy
            const serializedData = {
                sessionId: 'simple-session',
                location: ChatAgentLocation.Panel,
                hierarchy: {
                    rootBranchId: 'branch-root',
                    branches: {
                        'branch-root': {
                            id: 'branch-root',
                            items: [{ requestId: 'request-1' }],
                            activeBranchIndex: 0
                        }
                    }
                },
                requests: [
                    {
                        id: 'request-1',
                        text: 'Hello'
                    }
                ],
                responses: [
                    {
                        id: 'response-1',
                        requestId: 'request-1',
                        isComplete: true,
                        isError: false,
                        content: []
                    }
                ]
            };

            // Should restore without errors
            const model = new MutableChatModel(serializedData);
            expect(model.getRequests()).to.have.lengthOf(1);
            expect(model.getRequests()[0].request.text).to.equal('Hello');
        });
    });

    describe('Complete round-trip with complex tree', () => {
        it('should serialize and restore a complex tree structure', () => {
            // Create a complex chat with multiple edits
            const model1 = new MutableChatModel(ChatAgentLocation.Panel);

            // Level 1
            const req1 = model1.addRequest(createParsedRequest('Level 1 - Original'));
            req1.response.complete();

            // Level 2
            const req2 = model1.addRequest(createParsedRequest('Level 2 - Original'));
            req2.response.complete();

            // Edit Level 1
            const branch1 = model1.getBranch(req1.id);
            const req1edited = model1.addRequest(createParsedRequest('Level 1 - Edited'), 'agent-1');
            branch1!.add(req1edited);

            // Add Level 2 alternative after edited Level 1
            const req2alt = model1.addRequest(createParsedRequest('Level 2 - Alternative'));
            req2alt.response.complete();

            // Edit Level 2 alternative
            const branch2alt = model1.getBranch(req2alt.id);
            const req2altEdited = model1.addRequest(createParsedRequest('Level 2 - Alternative Edited'), 'agent-1');
            branch2alt!.add(req2altEdited);

            const serialized = model1.toSerializable();

            // Verify serialization
            expect(serialized.requests).to.have.lengthOf(5);
            expect(serialized.hierarchy).to.be.an('object');

            // Restore
            const model2 = new MutableChatModel(serialized);

            // Verify all requests are present
            const allRequests = model2.getAllRequests();
            expect(allRequests).to.have.lengthOf(5);

            // Verify branch structure
            const restoredBranch1 = model2.getBranches()[0];
            expect(restoredBranch1.items).to.have.lengthOf(2); // Original + Edited

            // Verify we can navigate the alternatives
            expect(restoredBranch1.items[0].element.request.text).to.equal('Level 1 - Original');
            expect(restoredBranch1.items[1].element.request.text).to.equal('Level 1 - Edited');
        });

        it('should preserve all requests across multiple serialization/restoration cycles', () => {
            // Create initial model
            let model = new MutableChatModel(ChatAgentLocation.Panel);
            const req1 = model.addRequest(createParsedRequest('Request 1'));
            req1.response.complete();

            // Cycle 1
            let serialized = model.toSerializable();
            model = new MutableChatModel(serialized);

            // Add more requests
            model.addRequest(createParsedRequest('Request 2'));

            // Cycle 2
            serialized = model.toSerializable();
            model = new MutableChatModel(serialized);

            // Add an edit
            const branch = model.getBranches()[0];
            const reqEdited = model.addRequest(createParsedRequest('Request 1 - Edited'), 'agent-1');
            branch.add(reqEdited);

            // Final cycle
            serialized = model.toSerializable();
            const finalModel = new MutableChatModel(serialized);

            // Verify all requests are preserved
            expect(finalModel.getBranches()[0].items).to.have.lengthOf(2);
            const allRequests = finalModel.getAllRequests();
            expect(allRequests).to.have.lengthOf(3);
        });
    });
});
