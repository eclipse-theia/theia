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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
// xterm.js (pulled in transitively via plugin-ext from VSXExtensionsModel) calls
// HTMLCanvasElement.prototype.getContext at module-load time. JSDOM's default impl
// throws 'Not implemented' without the optional `canvas` package; replace it with a
// no-op so the module graph evaluates. The tests below never render xterm itself.
const canvasProto = (globalThis as { HTMLCanvasElement?: { prototype: { getContext?: unknown } } }).HTMLCanvasElement?.prototype;
if (canvasProto) {
    canvasProto.getContext = () => undefined;
}
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { FuzzySearch } from '@theia/core/lib/common/fuzzy-search';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { TreeElement } from '@theia/core/lib/browser/source-tree';
import { VSXExtensionsModel } from './vsx-extensions-model';
import { VSXExtensionsSearchModel } from './vsx-extensions-search-model';
import { VSXExtensionsSource, VSXExtensionsSourceOptions } from './vsx-extensions-source';
import { ExtensionsSourceContribution, SearchResult } from './extensions-source-contribution';

after(() => disableJSDOM());

/**
 * Minimal contribution stub: yields a fixed set of search results. The element is
 * tagged with `id` so we can assert ordering after the fuzzy ranker has run.
 */
class StubContribution implements ExtensionsSourceContribution {
    readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    constructor(
        readonly type: string,
        readonly displayName: string,
        private readonly results: SearchResult[],
        readonly priority = 0
    ) { }
    resolveSearchResults(): Iterable<SearchResult> {
        return this.results;
    }
}

interface TaggedElement extends TreeElement {
    readonly id: string;
}

function makeResult(id: string, searchableText: string): SearchResult {
    const element: TaggedElement = { id, render: () => undefined };
    return { element, searchableText };
}

class StubSearchModel {
    query: string = '';
}

class StubPreferenceService {
    public verifiedOnly: boolean = false;
    get<T>(key: string, defaultValue?: T): T | undefined {
        if (key === 'extensions.onlyShowVerifiedExtensions') {
            return this.verifiedOnly as unknown as T;
        }
        return defaultValue;
    }
}

function buildSource(contributions: ExtensionsSourceContribution[], query: string): VSXExtensionsSource {
    const container = new Container();
    container.bind(VSXExtensionsSourceOptions).toConstantValue({ id: VSXExtensionsSourceOptions.SEARCH_RESULT });
    container.bind(VSXExtensionsModel).toConstantValue({
        onDidChange: new Emitter<void>().event
    } as unknown as VSXExtensionsModel);
    const provider: ContributionProvider<ExtensionsSourceContribution> = { getContributions: () => contributions };
    container.bind(ContributionProvider).toConstantValue(provider).whenTargetNamed(ExtensionsSourceContribution);
    const searchModel = new StubSearchModel();
    searchModel.query = query;
    container.bind(VSXExtensionsSearchModel).toConstantValue(searchModel as unknown as VSXExtensionsSearchModel);
    container.bind(PreferenceService).toConstantValue(new StubPreferenceService() as unknown as PreferenceService);
    container.bind(FuzzySearch).toSelf().inSingletonScope();
    container.bind(VSXExtensionsSource).toSelf().inSingletonScope();
    return container.get(VSXExtensionsSource);
}

describe('VSXExtensionsSource.collectSearchResults', () => {

    it('passes hits through unranked when the query is empty', async () => {
        const contribution = new StubContribution('extension', 'Extensions', [
            makeResult('a', 'alpha'),
            makeResult('b', 'beta')
        ]);
        const source = buildSource([contribution], '');

        const elements = [...(await source.getElements())] as TaggedElement[];

        expect(elements.map(e => e.id)).to.deep.equal(['a', 'b']);
    });

    it('passes hits through unranked when there is only one result, regardless of query', async () => {
        const contribution = new StubContribution('extension', 'Extensions', [
            makeResult('only', 'unrelated text')
        ]);
        const source = buildSource([contribution], 'something');

        const elements = [...(await source.getElements())] as TaggedElement[];

        expect(elements.map(e => e.id)).to.deep.equal(['only']);
    });

    it('re-ranks hits from multiple contributions globally so the best match for the query surfaces first', async () => {
        // First contribution exposes a weak match for "git"; second contribution exposes
        // a much better match. Without global ranking the weak match would win simply
        // because it came from the earlier contribution.
        const weak = new StubContribution('extension', 'Extensions', [
            makeResult('weakly-related', 'configuration tool that integrates with git pipelines')
        ]);
        const strong = new StubContribution('mcp-server', 'MCP Servers', [
            makeResult('strong-match', 'git')
        ], 100);
        const source = buildSource([weak, strong], 'git');

        const elements = [...(await source.getElements())] as TaggedElement[];

        expect(elements[0].id).to.equal('strong-match');
    });

    it('drops hits whose searchableText does not match the query at all', async () => {
        const contribution = new StubContribution('extension', 'Extensions', [
            makeResult('matches', 'git client'),
            makeResult('nope', 'totally unrelated content')
        ]);
        const source = buildSource([contribution], 'git');

        const elements = [...(await source.getElements())] as TaggedElement[];

        expect(elements.map(e => e.id)).to.deep.equal(['matches']);
    });
});
