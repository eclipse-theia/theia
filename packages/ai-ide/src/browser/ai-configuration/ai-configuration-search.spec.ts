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

import { expect } from 'chai';
import { AiConfigurationSearchItem } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiConfigurationSearch } from './ai-configuration-search';

function item(label: string, options?: Partial<AiConfigurationSearchItem>): AiConfigurationSearchItem {
    return {
        label,
        typeLabel: options?.typeLabel ?? 'Setting',
        categoryId: options?.categoryId ?? 'general',
        target: options?.target ?? { categoryId: options?.categoryId ?? 'general' },
        keywords: options?.keywords
    };
}

describe('AiConfigurationSearch', () => {

    describe('terms', () => {
        it('splits on whitespace, lower-cases, and drops empties', () => {
            expect(AiConfigurationSearch.terms('  Default   Chat  ')).to.deep.equal(['default', 'chat']);
        });

        it('returns an empty array for a blank query', () => {
            expect(AiConfigurationSearch.terms('   ')).to.deep.equal([]);
        });
    });

    describe('matchKey', () => {
        it('folds label, keywords, and type label into a lower-cased key', () => {
            const key = AiConfigurationSearch.matchKey(item('Default Chat Agent', { typeLabel: 'Agent', keywords: 'orchestrator id-42' }));
            expect(key).to.equal('default chat agent orchestrator id-42 agent');
        });

        it('omits missing keywords', () => {
            expect(AiConfigurationSearch.matchKey(item('MCP Server', { typeLabel: 'MCP Server' }))).to.equal('mcp server  mcp server');
        });
    });

    describe('match', () => {
        const index = [
            item('Default Chat Agent', { typeLabel: 'Agent', categoryId: 'agents', keywords: 'orchestrator' }),
            item('Universal', { typeLabel: 'Agent', categoryId: 'agents' }),
            item('Filesystem', { typeLabel: 'MCP Server', categoryId: 'mcp-servers', keywords: 'files' }),
            item('Enable AI Features', { typeLabel: 'Setting', categoryId: 'general' })
        ];

        it('returns no results for a blank query', () => {
            expect(AiConfigurationSearch.match(index, '   ')).to.have.length(0);
        });

        it('requires every term to be present (AND semantics)', () => {
            const results = AiConfigurationSearch.match(index, 'chat agent');
            expect(results.map(r => r.label)).to.deep.equal(['Default Chat Agent']);
        });

        it('matches against keywords and type label', () => {
            expect(AiConfigurationSearch.match(index, 'orchestrator').map(r => r.label)).to.deep.equal(['Default Chat Agent']);
            expect(AiConfigurationSearch.match(index, 'mcp').map(r => r.label)).to.deep.equal(['Filesystem']);
        });

        it('is case-insensitive', () => {
            expect(AiConfigurationSearch.match(index, 'UNIVERSAL').map(r => r.label)).to.deep.equal(['Universal']);
        });

        it('preserves index order', () => {
            expect(AiConfigurationSearch.match(index, 'a').map(r => r.label)).to.deep.equal([
                'Default Chat Agent', 'Universal', 'Enable AI Features'
            ]);
        });

        it('caps the number of results', () => {
            const many = Array.from({ length: 20 }, (_, i) => item(`Setting ${i}`));
            expect(AiConfigurationSearch.match(many, 'setting', 14)).to.have.length(14);
            expect(AiConfigurationSearch.match(many, 'setting')).to.have.length(AiConfigurationSearch.MAX_RESULTS);
        });
    });
});
