// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    applyStickyComposerToken,
    buildStickyComposerMentionOptions,
    buildStickyComposerVariableOptions,
    filterTokenOptions,
    findActiveComposerToken,
    findActiveTokenQuery,
    formatVariableInsertBody,
} from './qaap-sticky-composer-mention';

describe('qaap-sticky-composer-mention', () => {

    it('findActiveTokenQuery detects @ and # fragments at caret', () => {
        expect(findActiveTokenQuery('hello @qai', 10, '@')).to.deep.equal({ start: 6, query: 'qai' });
        expect(findActiveTokenQuery('ctx #file', 9, '#')).to.deep.equal({ start: 4, query: 'file' });
        expect(findActiveTokenQuery('foo@bar', 7, '@')).to.be.undefined;
        expect(findActiveTokenQuery('@codex run', 7, '@')).to.be.undefined;
        expect(findActiveTokenQuery('hello @qai, there', 11, '@')).to.be.undefined;
    });

    it('findActiveComposerToken prefers the rightmost active trigger', () => {
        expect(findActiveComposerToken('ask @qai #wor', 14)).to.deep.equal({
            start: 9,
            query: 'wor',
            trigger: '#',
        });
    });

    it('formatVariableInsertBody matches chat completion rules', () => {
        expect(formatVariableInsertBody({ id: 'x', name: 'workspace', description: '' }))
            .to.equal('workspace ');
        expect(formatVariableInsertBody({
            id: 'x',
            name: 'file',
            description: '',
            args: [{ name: 'path', description: 'path' }],
        })).to.equal('file:');
    });

    it('filterTokenOptions matches id, label, and body prefixes', () => {
        const agents = buildStickyComposerMentionOptions(
            [{ id: 'qaiq', label: 'QAIQ', available: true }],
            { name: 'Coder' },
        );
        expect(filterTokenOptions(agents, 'qa').map(o => o.id)).to.deep.equal(['qaiq']);
        const vars = buildStickyComposerVariableOptions([
            { id: 'v1', name: 'workspace', description: 'Workspace files' },
        ]);
        expect(filterTokenOptions(vars, 'work').map(o => o.id)).to.deep.equal(['workspace']);
    });

    it('applyStickyComposerToken replaces active fragment or inserts at caret', () => {
        const mention = { id: 'qaiq', label: 'QAIQ', trigger: '@' as const, insertBody: 'qaiq ' };
        expect(applyStickyComposerToken('fix @qa', 7, mention)).to.deep.equal({
            value: 'fix @qaiq ',
            caret: 10,
        });
        const variable = { id: 'workspace', label: 'Workspace', trigger: '#' as const, insertBody: 'workspace ' };
        expect(applyStickyComposerToken('see #wor', 8, variable)).to.deep.equal({
            value: 'see #workspace ',
            caret: 15,
        });
    });
});
