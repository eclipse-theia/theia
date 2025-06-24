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
const { expect } = require('chai');
const { OpenAiModelUtils } = require('./openai-language-model');
const utils = new OpenAiModelUtils();

describe('OpenAiModelUtils - processMessages', () => {
    describe("when developerMessageSettings is 'skip'", () => {
        it('should remove all system messages', () => {
            const messages = [
                { actor: 'system', type: 'text', text: 'system message' },
                { actor: 'user', type: 'text', text: 'user message' },
                { actor: 'system', type: 'text', text: 'another system message' },
            ];
            const result = utils.processMessages(messages, 'skip');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' }
            ]);
        });

        it('should do nothing if there is no system message', () => {
            const messages = [
                { actor: 'user', type: 'text', text: 'user message' },
                { actor: 'user', type: 'text', text: 'another user message' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'skip');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' },
                { role: 'user', content: 'another user message' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });
    });

    describe("when developerMessageSettings is 'mergeWithFollowingUserMessage'", () => {
        it('should merge the system message with the next user message, assign role user, and remove the system message', () => {
            const messages = [
                { actor: 'system', type: 'text', text: 'system msg' },
                { actor: 'user', type: 'text', text: 'user msg' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'mergeWithFollowingUserMessage');
            expect(result).to.deep.equal([
                { role: 'user', content: 'system msg\nuser msg' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });

        it('should create a new user message if no user message exists, and remove the system message', () => {
            const messages = [
                { actor: 'system', type: 'text', text: 'system only msg' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'mergeWithFollowingUserMessage');
            expect(result).to.deep.equal([
                { role: 'user', content: 'system only msg' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });

        it('should create a merge multiple system message with the next user message', () => {
            const messages = [
                { actor: 'user', type: 'text', text: 'user message' },
                { actor: 'system', type: 'text', text: 'system message' },
                { actor: 'system', type: 'text', text: 'system message2' },
                { actor: 'user', type: 'text', text: 'user message2' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'mergeWithFollowingUserMessage');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' },
                { role: 'user', content: 'system message\nsystem message2\nuser message2' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });

        it('should create a new user message from several system messages if the next message is not a user message', () => {
            const messages = [
                { actor: 'user', type: 'text', text: 'user message' },
                { actor: 'system', type: 'text', text: 'system message' },
                { actor: 'system', type: 'text', text: 'system message2' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'mergeWithFollowingUserMessage');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' },
                { role: 'user', content: 'system message\nsystem message2' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });
    });

    describe('when no special merging or skipping is needed', () => {
        it('should leave messages unchanged in ordering and assign roles based on developerMessageSettings', () => {
            const messages = [
                { actor: 'user', type: 'text', text: 'user message' },
                { actor: 'system', type: 'text', text: 'system message' },
                { actor: 'ai', type: 'text', text: 'ai message' }
            ];
            // Using a developerMessageSettings that is not merge/skip, e.g., 'developer'
            const result = utils.processMessages(messages, 'developer');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' },
                { role: 'developer', content: 'system message' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });
    });

    describe('role assignment for system messages when developerMessageSettings is one of the role strings', () => {
        it('should assign role as specified for a system message when developerMessageSettings is "user"', () => {
            const messages = [
                { actor: 'system', type: 'text', text: 'system msg' },
                { actor: 'ai', type: 'text', text: 'ai msg' }
            ];
            // Since the first message is system and developerMessageSettings is not merge/skip, ordering is not adjusted
            const result = utils.processMessages(messages, 'user');
            expect(result).to.deep.equal([
                { role: 'user', content: 'system msg' },
                { role: 'assistant', content: 'ai msg' }
            ]);
        });

        it('should assign role as specified for a system message when developerMessageSettings is "system"', () => {
            const messages = [
                { actor: 'system', type: 'text', text: 'system msg' },
                { actor: 'ai', type: 'text', text: 'ai msg' }
            ];
            const result = utils.processMessages(messages, 'system');
            expect(result).to.deep.equal([
                { role: 'system', content: 'system msg' },
                { role: 'assistant', content: 'ai msg' }
            ]);
        });

        it('should assign role as specified for a system message when developerMessageSettings is "developer"', () => {
            const messages = [
                { actor: 'system', type: 'text', text: 'system msg' },
                { actor: 'user', type: 'text', text: 'user msg' },
                { actor: 'ai', type: 'text', text: 'ai msg' }
            ];
            const result = utils.processMessages(messages, 'developer');
            expect(result).to.deep.equal([
                { role: 'developer', content: 'system msg' },
                { role: 'user', content: 'user msg' },
                { role: 'assistant', content: 'ai msg' }
            ]);
        });
    });
});
