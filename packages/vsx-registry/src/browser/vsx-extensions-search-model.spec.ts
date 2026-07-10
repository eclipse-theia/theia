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
import { Container } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { ExtensionsSourceContribution } from './extensions-source-contribution';
import { VSXExtensionsSearchModel, VSXSearchMode } from './vsx-extensions-search-model';

class StubContribution implements ExtensionsSourceContribution {
    readonly onDidChange = new Emitter<void>().event;
    constructor(readonly type: string, readonly displayName: string, readonly searchToken: string, readonly priority = 0) { }
}

function buildModel(contributions: ExtensionsSourceContribution[] = defaultContributions()): VSXExtensionsSearchModel {
    const container = new Container();
    const provider: ContributionProvider<ExtensionsSourceContribution> = { getContributions: () => contributions };
    container.bind(ContributionProvider).toConstantValue(provider).whenTargetNamed(ExtensionsSourceContribution);
    container.bind(VSXExtensionsSearchModel).toSelf().inSingletonScope();
    return container.get(VSXExtensionsSearchModel);
}

function defaultContributions(): ExtensionsSourceContribution[] {
    return [
        new StubContribution('extension', 'Extensions', '@extensions'),
        new StubContribution('mcp-server', 'MCP Servers', '@mcp'),
        new StubContribution('skill', 'Skills', '@skills')
    ];
}

describe('VSXExtensionsSearchModel.parseQuery', () => {

    it('returns None mode with no tokens for an empty query', () => {
        const model = buildModel();
        const parsed = model.parseQuery();
        expect(parsed.mode).to.equal(VSXSearchMode.None);
        expect([...parsed.typeTokens]).to.deep.equal([]);
        expect(parsed.freeText).to.equal('');
    });

    it('returns Search mode with the original free text when only free text is present', () => {
        const model = buildModel();
        model.query = 'hello world';
        const parsed = model.parseQuery();
        expect(parsed.mode).to.equal(VSXSearchMode.Search);
        expect([...parsed.typeTokens]).to.deep.equal([]);
        expect(parsed.freeText).to.equal('hello world');
    });

    it('parses a single mode token and yields no free text', () => {
        const model = buildModel();
        model.query = '@installed';
        const parsed = model.parseQuery();
        expect(parsed.mode).to.equal(VSXSearchMode.Installed);
        expect([...parsed.typeTokens]).to.deep.equal([]);
        expect(parsed.freeText).to.equal('');
    });

    it('extracts type tokens and leaves None mode when there is no free text', () => {
        const model = buildModel();
        model.query = '@mcp';
        const parsed = model.parseQuery();
        // `@mcp` alone scopes the view (Installed + Recommended + Built-in sections) to MCP,
        // so there is no Search mode and no free text to send to OVSX.
        expect(parsed.mode).to.equal(VSXSearchMode.None);
        expect([...parsed.typeTokens]).to.deep.equal(['@mcp']);
        expect(parsed.freeText).to.equal('');
    });

    it('composes mode and type tokens with the remaining free text', () => {
        const model = buildModel();
        model.query = '@installed @mcp asana';
        const parsed = model.parseQuery();
        expect(parsed.mode).to.equal(VSXSearchMode.Installed);
        expect([...parsed.typeTokens]).to.deep.equal(['@mcp']);
        expect(parsed.freeText).to.equal('asana');
    });

    it('accepts the same token in any order and accumulates type tokens', () => {
        const model = buildModel();
        model.query = '@mcp @skills foo';
        const parsed = model.parseQuery();
        expect(parsed.mode).to.equal(VSXSearchMode.Search);
        expect([...parsed.typeTokens].sort()).to.deep.equal(['@mcp', '@skills']);
        expect(parsed.freeText).to.equal('foo');
    });

    it('keeps the first of two mode tokens and treats the second as free text', () => {
        const model = buildModel();
        model.query = '@installed @builtin';
        const parsed = model.parseQuery();
        expect(parsed.mode).to.equal(VSXSearchMode.Installed);
        // The second mode token survives as free text rather than silently overriding the first;
        // surfacing it lets the user notice the conflict in the input box.
        expect(parsed.freeText).to.equal('@builtin');
    });

    it('treats unknown @-prefixed tokens as free text', () => {
        const model = buildModel();
        model.query = '@unknown alpha';
        const parsed = model.parseQuery();
        expect(parsed.mode).to.equal(VSXSearchMode.Search);
        expect([...parsed.typeTokens]).to.deep.equal([]);
        expect(parsed.freeText).to.equal('@unknown alpha');
    });
});

describe('VSXExtensionsSearchModel.isTokenEnabled', () => {

    it('reports every token enabled when no type tokens are present', () => {
        const model = buildModel();
        model.query = 'anything';
        expect(model.isTokenEnabled('@extensions')).to.equal(true);
        expect(model.isTokenEnabled('@mcp')).to.equal(true);
        expect(model.isTokenEnabled('@skills')).to.equal(true);
    });

    it('reports only the tokens present in the query as enabled', () => {
        const model = buildModel();
        model.query = '@mcp asana';
        expect(model.isTokenEnabled('@mcp')).to.equal(true);
        expect(model.isTokenEnabled('@extensions')).to.equal(false);
        expect(model.isTokenEnabled('@skills')).to.equal(false);
    });

    it('reports both tokens enabled when both appear in the query', () => {
        const model = buildModel();
        model.query = '@mcp @skills';
        expect(model.isTokenEnabled('@mcp')).to.equal(true);
        expect(model.isTokenEnabled('@skills')).to.equal(true);
        expect(model.isTokenEnabled('@extensions')).to.equal(false);
    });
});

describe('VSXExtensionsSearchModel.onDidChangeQuery', () => {

    it('fires when the query value changes', () => {
        const model = buildModel();
        let fired = 0;
        model.onDidChangeQuery(() => fired++);
        model.query = 'hello';
        expect(fired).to.equal(1);
    });

    it('short-circuits when the new value matches the current one', () => {
        const model = buildModel();
        model.query = 'same';
        let fired = 0;
        model.onDidChangeQuery(() => fired++);
        model.query = 'same';
        expect(fired).to.equal(0);
    });
});
