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
        it('should remove the first system message and assign roles correctly', () => {
            const messages = [
                { actor: 'system', type: 'text', query: 'system message' },
                { actor: 'user', type: 'text', query: 'user message' },
                { actor: 'system', type: 'text', query: 'another system message' },
            ];
            const result = utils.processMessages(messages, 'skip');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' },
                { role: 'developer', content: 'another system message' }
            ]);
        });

        it('should do nothing if the first message is not system', () => {
            const messages = [
                { actor: 'user', type: 'text', query: 'user message' },
                { actor: 'user', type: 'text', query: 'another user message' },
                { actor: 'ai', type: 'text', query: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'skip');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' },
                { role: 'user', content: 'another user message' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });
    });

    describe("when developerMessageSettings is 'mergeWithFirstUserMessage'", () => {
        it('should merge the first system message with the first user message, assign role user, and remove the system message', () => {
            const messages = [
                { actor: 'system', type: 'text', query: 'system msg' },
                { actor: 'user', type: 'text', query: 'user msg' },
                { actor: 'ai', type: 'text', query: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'mergeWithFirstUserMessage');
            expect(result).to.deep.equal([
                { role: 'user', content: 'system msg\nuser msg' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });

        it('should create a new user message if no user message exists, and remove the system message', () => {
            const messages = [
                { actor: 'system', type: 'text', query: 'system only msg' },
                { actor: 'ai', type: 'text', query: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'mergeWithFirstUserMessage');
            expect(result).to.deep.equal([
                { role: 'user', content: 'system only msg' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });

        it('should do nothing if the first message is not system', () => {
            const messages = [
                { actor: 'user', type: 'text', query: 'user message' },
                { actor: 'system', type: 'text', query: 'system message' },
                { actor: 'ai', type: 'text', query: 'ai message' }
            ];
            const result = utils.processMessages(messages, 'mergeWithFirstUserMessage');
            expect(result).to.deep.equal([
                { role: 'user', content: 'user message' },
                { role: 'developer', content: 'system message' },
                { role: 'assistant', content: 'ai message' }
            ]);
        });
    });

    describe('when no special merging or skipping is needed', () => {
        it('should leave messages unchanged in ordering and assign roles based on developerMessageSettings if first message is not system', () => {
            const messages = [
                { actor: 'user', type: 'text', query: 'user message' },
                { actor: 'system', type: 'text', query: 'system message' },
                { actor: 'ai', type: 'text', query: 'ai message' }
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
                { actor: 'system', type: 'text', query: 'system msg' },
                { actor: 'ai', type: 'text', query: 'ai msg' }
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
                { actor: 'system', type: 'text', query: 'system msg' },
                { actor: 'ai', type: 'text', query: 'ai msg' }
            ];
            const result = utils.processMessages(messages, 'system');
            expect(result).to.deep.equal([
                { role: 'system', content: 'system msg' },
                { role: 'assistant', content: 'ai msg' }
            ]);
        });

        it('should assign role as specified for a system message when developerMessageSettings is "developer"', () => {
            const messages = [
                { actor: 'system', type: 'text', query: 'system msg' },
                { actor: 'user', type: 'text', query: 'user msg' },
                { actor: 'ai', type: 'text', query: 'ai msg' }
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
