// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { ChatToolRequestService, isEmptyToolArgs, matchesToolPattern, normalizeToolArgs } from './chat-tool-request-service';
import { ToolRequest } from '@theia/ai-core';
import { MutableChatRequestModel } from './chat-model';

describe('Tool Arguments Utilities', () => {

    describe('isEmptyToolArgs', () => {
        it('should return true for undefined', () => {
            expect(isEmptyToolArgs(undefined)).to.be.true;
        });

        it('should return true for empty string', () => {
            expect(isEmptyToolArgs('')).to.be.true;
        });

        it('should return true for empty JSON object', () => {
            expect(isEmptyToolArgs('{}')).to.be.true;
        });

        it('should return true for empty JSON object with whitespace', () => {
            expect(isEmptyToolArgs('{ }')).to.be.true;
            expect(isEmptyToolArgs('{  }')).to.be.true;
            expect(isEmptyToolArgs('{\n}')).to.be.true;
            expect(isEmptyToolArgs('{ \n }')).to.be.true;
        });

        it('should return false for non-empty JSON object', () => {
            expect(isEmptyToolArgs('{"key": "value"}')).to.be.false;
            expect(isEmptyToolArgs('{"file": "test.ts"}')).to.be.false;
        });

        it('should return false for JSON array', () => {
            expect(isEmptyToolArgs('[]')).to.be.false;
            expect(isEmptyToolArgs('[1, 2, 3]')).to.be.false;
        });

        it('should return false for invalid JSON', () => {
            expect(isEmptyToolArgs('not json')).to.be.false;
            expect(isEmptyToolArgs('{')).to.be.false;
            expect(isEmptyToolArgs('{"truncated')).to.be.false;
        });

        it('should return false for JSON primitives', () => {
            expect(isEmptyToolArgs('null')).to.be.false;
            expect(isEmptyToolArgs('true')).to.be.false;
            expect(isEmptyToolArgs('42')).to.be.false;
            expect(isEmptyToolArgs('"string"')).to.be.false;
        });
    });

    describe('normalizeToolArgs', () => {
        it('should normalize undefined to empty string', () => {
            expect(normalizeToolArgs(undefined)).to.equal('');
        });

        it('should normalize empty string to empty string', () => {
            expect(normalizeToolArgs('')).to.equal('');
        });

        it('should normalize empty JSON object to empty string', () => {
            expect(normalizeToolArgs('{}')).to.equal('');
            expect(normalizeToolArgs('{ }')).to.equal('');
        });

        it('should preserve non-empty JSON arguments', () => {
            const args = '{"file": "test.ts"}';
            expect(normalizeToolArgs(args)).to.equal(args);
        });

        it('should preserve invalid JSON as-is', () => {
            const args = 'not json';
            expect(normalizeToolArgs(args)).to.equal(args);
        });

        it('should allow matching empty arguments from different representations', () => {
            const fromStream = '{}';
            const fromHandler = '';

            expect(normalizeToolArgs(fromStream)).to.equal(normalizeToolArgs(fromHandler));
        });
    });
});

describe('matchesToolPattern', () => {
    it('matches an exact id', () => expect(matchesToolPattern('getFile', 'getFile')).to.be.true);
    it('rejects a different id', () => expect(matchesToolPattern('getFile', 'getFiles')).to.be.false);
    it('matches everything with *', () => expect(matchesToolPattern('*', 'anything')).to.be.true);
    it('matches a prefix glob', () => expect(matchesToolPattern('mcp_*', 'mcp_search')).to.be.true);
    it('matches a suffix glob', () => expect(matchesToolPattern('*_search', 'mcp_search')).to.be.true);
    it('matches an infix glob', () => expect(matchesToolPattern('k2_*_query', 'k2_fabric_query')).to.be.true);
    it('treats regex metacharacters as literals', () => {
        expect(matchesToolPattern('a.b', 'a.b')).to.be.true;
        expect(matchesToolPattern('a.b', 'axb')).to.be.false;
    });
    it('is case-sensitive', () => expect(matchesToolPattern('GetFile', 'getfile')).to.be.false);
    it('combines a literal metacharacter with a glob', () => {
        expect(matchesToolPattern('a.*_x', 'a.foo_x')).to.be.true;
        expect(matchesToolPattern('a.*_x', 'aXfoo_x')).to.be.false;
    });
});

describe('ChatToolRequestService agent tool policy', () => {
    const tool = (id: string): ToolRequest => ({ id, name: id, parameters: { type: 'object', properties: {} }, handler: async () => undefined });
    const requestModel = (toolIds: string[], rootSessionId?: string): MutableChatRequestModel => ({
        message: { toolRequests: new Map(toolIds.map(id => [id, tool(id)])) },
        session: { rootSessionId }
    } as unknown as MutableChatRequestModel);
    const service = new ChatToolRequestService();
    const ids = (tools: ToolRequest[]) => tools.map(t => t.id);

    it('leaves tools untouched without an agent policy', () => {
        expect(ids(service.toChatToolRequests([tool('a'), tool('b')], requestModel([])))).to.deep.equal(['a', 'b']);
    });
    it('caps to allowedTools', () => {
        expect(ids(service.toChatToolRequests([tool('a'), tool('b')], requestModel([]), { allowedTools: ['a'] }))).to.deep.equal(['a']);
    });
    it('allows nothing on an explicit empty allowedTools', () => {
        expect(ids(service.toChatToolRequests([tool('a')], requestModel([]), { allowedTools: [] }))).to.deep.equal([]);
    });
    it('removes disallowedTools matches, deny wins over allow', () => {
        expect(ids(service.toChatToolRequests([tool('a'), tool('b')], requestModel([]), { allowedTools: ['*'], disallowedTools: ['a'] }))).to.deep.equal(['b']);
    });
    it('applies globs in both lists', () => {
        expect(ids(service.toChatToolRequests([tool('mcp_x'), tool('other')], requestModel([]), { disallowedTools: ['mcp_*'] }))).to.deep.equal(['other']);
    });
    it('grants request tools in a non-delegated session', () => {
        expect(ids(service.getChatToolRequests(requestModel(['a', 'getSkillFileContent'])))).to.deep.equal(['a', 'getSkillFileContent']);
    });
    it('caps request grants to the allowlist in a delegated session', () => {
        expect(ids(service.getChatToolRequests(requestModel(['a', 'getSkillFileContent'], 'root')))).to.deep.equal(['getSkillFileContent']);
    });
    it('subjects the delegation allowlist to the agent deny list', () => {
        expect(ids(service.getChatToolRequests(requestModel(['getSkillFileContent'], 'root'), { disallowedTools: ['getSkillFileContent'] }))).to.deep.equal([]);
    });
    it('does not apply the delegated-session request-text cap to the declared path', () => {
        expect(ids(service.toChatToolRequests([tool('a')], requestModel([], 'root')))).to.deep.equal(['a']);
    });
});
