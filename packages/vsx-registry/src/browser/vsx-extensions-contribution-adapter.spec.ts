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
import { VSXExtension } from './vsx-extension';
import { VSXExtensionsModel } from './vsx-extensions-model';
import { VSXExtensionsContributionAdapter } from './vsx-extensions-contribution-adapter';
import { SearchResult } from './extensions-source-contribution';

after(() => disableJSDOM());

interface StubExtensionShape {
    id: string;
    displayName?: string;
    publisher?: string;
    description?: string;
    builtin?: boolean;
}

class StubModel {
    readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    private readonly extensions = new Map<string, StubExtensionShape>();
    private _installed: string[] = [];
    private _recommended: string[] = [];
    private _searchResult: string[] = [];

    setExtensions(extensions: StubExtensionShape[]): void {
        for (const ext of extensions) {
            this.extensions.set(ext.id, ext);
        }
    }
    setInstalled(versioned: string[]): void { this._installed = versioned; }
    setRecommended(ids: string[]): void { this._recommended = ids; }
    setSearchResult(ids: string[]): void { this._searchResult = ids; }

    get installed(): IterableIterator<string> { return this._installed.values(); }
    get recommended(): IterableIterator<string> { return this._recommended.values(); }
    get searchResult(): IterableIterator<string> { return this._searchResult.values(); }

    isInstalled(id: string): boolean { return this._installed.some(v => v.startsWith(`${id}@`) || v === id); }
    getExtension(id: string): VSXExtension | undefined {
        return this.extensions.get(id) as unknown as VSXExtension | undefined;
    }
}

function buildAdapter(model: StubModel): VSXExtensionsContributionAdapter {
    const container = new Container();
    container.bind(VSXExtensionsModel).toConstantValue(model as unknown as VSXExtensionsModel);
    container.bind(VSXExtensionsContributionAdapter).toSelf().inSingletonScope();
    return container.get(VSXExtensionsContributionAdapter);
}

describe('VSXExtensionsContributionAdapter.resolveInstalled', () => {

    it('yields installed user extensions and filters out built-ins', () => {
        const model = new StubModel();
        model.setExtensions([
            { id: 'pub.userext', displayName: 'User Ext', builtin: false },
            { id: 'pub.builtinext', displayName: 'Builtin Ext', builtin: true }
        ]);
        model.setInstalled(['pub.userext@1.0.0', 'pub.builtinext@1.0.0']);
        const adapter = buildAdapter(model);

        const ids = [...adapter.resolveInstalled()].map(e => (e as unknown as StubExtensionShape).id);

        expect(ids).to.deep.equal(['pub.userext']);
    });

    it('skips versioned ids whose extension is unknown to the model (entries deployed but not yet resolved)', () => {
        const model = new StubModel();
        model.setExtensions([{ id: 'pub.known', displayName: 'Known', builtin: false }]);
        model.setInstalled(['pub.known@1.0.0', 'pub.unknown@1.0.0']);
        const adapter = buildAdapter(model);

        const ids = [...adapter.resolveInstalled()].map(e => (e as unknown as StubExtensionShape).id);

        expect(ids).to.deep.equal(['pub.known']);
    });
});

describe('VSXExtensionsContributionAdapter.resolveBuiltIn', () => {

    it('mirrors resolveInstalled but yields only built-ins', () => {
        const model = new StubModel();
        model.setExtensions([
            { id: 'pub.userext', displayName: 'User Ext', builtin: false },
            { id: 'pub.builtinext', displayName: 'Builtin Ext', builtin: true }
        ]);
        model.setInstalled(['pub.userext@1.0.0', 'pub.builtinext@1.0.0']);
        const adapter = buildAdapter(model);

        const ids = [...adapter.resolveBuiltIn()].map(e => (e as unknown as StubExtensionShape).id);

        expect(ids).to.deep.equal(['pub.builtinext']);
    });
});

describe('VSXExtensionsContributionAdapter.resolveRecommended', () => {

    it('yields recommendations the user does not yet have installed and that are not built-ins', () => {
        const model = new StubModel();
        model.setExtensions([
            { id: 'pub.alreadyinstalled', displayName: 'Already', builtin: false },
            { id: 'pub.builtinrec', displayName: 'Builtin Rec', builtin: true },
            { id: 'pub.newrec', displayName: 'New Rec', builtin: false }
        ]);
        model.setInstalled(['pub.alreadyinstalled@1.0.0']);
        model.setRecommended(['pub.alreadyinstalled', 'pub.builtinrec', 'pub.newrec']);
        const adapter = buildAdapter(model);

        const ids = [...adapter.resolveRecommended()].map(e => (e as unknown as StubExtensionShape).id);

        // Already installed → filtered; built-in → filtered (recommendations are user-facing
        // opt-ins, not built-ins); fresh recommendation → kept.
        expect(ids).to.deep.equal(['pub.newrec']);
    });
});

describe('VSXExtensionsContributionAdapter.resolveSearchResults', () => {

    it("yields the model's current search result and concatenates the user-visible fields into searchableText for the global ranker", () => {
        const model = new StubModel();
        model.setExtensions([
            { id: 'pub.match', displayName: 'Match', publisher: 'pub', description: 'Some description', builtin: false }
        ]);
        model.setSearchResult(['pub.match']);
        const adapter = buildAdapter(model);

        const results = [...adapter.resolveSearchResults()] as SearchResult[];

        expect(results).to.have.length(1);
        // The id-derived element is whatever the model returns; we only assert searchableText
        // contains the distinctive fields used by the cross-contribution fuzzy ranker.
        expect(results[0].searchableText).to.contain('Match');
        expect(results[0].searchableText).to.contain('pub.match');
        expect(results[0].searchableText).to.contain('pub');
        expect(results[0].searchableText).to.contain('Some description');
    });

    it('omits built-ins from search results so the user can never reinstall something they already have shipped', () => {
        const model = new StubModel();
        model.setExtensions([
            { id: 'pub.userext', displayName: 'User', builtin: false },
            { id: 'pub.builtinext', displayName: 'Builtin', builtin: true }
        ]);
        model.setSearchResult(['pub.userext', 'pub.builtinext']);
        const adapter = buildAdapter(model);

        const ids = [...adapter.resolveSearchResults()].map(r => (r.element as unknown as StubExtensionShape).id);

        expect(ids).to.deep.equal(['pub.userext']);
    });
});
