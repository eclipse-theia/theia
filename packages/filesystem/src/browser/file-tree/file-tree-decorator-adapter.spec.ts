// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { Decoration, DecorationsProvider, DecorationsService, DecorationsServiceImpl } from '@theia/core/lib/browser/decorations-service';
import { CompositeTreeNode, Tree } from '@theia/core/lib/browser/tree';
import { CancellationToken, Emitter, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { Container } from '@theia/core/shared/inversify';
import { expect } from 'chai';
import { FileTreeDecoratorAdapter } from './file-tree-decorator-adapter';

disableJSDOM();

class TestDecorationsProvider implements DecorationsProvider {

    protected readonly onDidChangeEmitter = new Emitter<URI[] | undefined>();
    readonly decorations = new Map<string, Decoration>();
    readonly queried: string[] = [];

    get onDidChange(): Event<URI[] | undefined> {
        return this.onDidChangeEmitter.event;
    }

    fireDidChange(uris?: URI[]): void {
        this.onDidChangeEmitter.fire(uris);
    }

    provideDecorations(uri: URI, token: CancellationToken): Promise<Decoration | undefined> {
        this.queried.push(uri.toString());
        return Promise.resolve(this.decorations.get(uri.toString()));
    }
}

function createTree(uris: string[]): Tree {
    const root = {
        id: 'root',
        name: 'root',
        parent: undefined,
        children: []
    } as unknown as CompositeTreeNode;
    const children = uris.map(uri => ({
        id: uri,
        name: new URI(uri).path.base,
        parent: root,
        fileStat: { resource: new URI(uri) }
    }));
    children.forEach((child, index) => Object.assign(child, { nextSibling: children[index + 1] }));
    Object.assign(root, { children });
    return { root } as unknown as Tree;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

describe('FileTreeDecoratorAdapter', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    const fileUris = ['file:///project/f1.ts', 'file:///project/f2.ts', 'file:///project/f3.ts'];

    let service: DecorationsServiceImpl;
    let provider: TestDecorationsProvider;
    let adapter: FileTreeDecoratorAdapter;
    let tree: Tree;

    beforeEach(() => {
        service = new DecorationsServiceImpl();
        provider = new TestDecorationsProvider();
        service.registerDecorationsProvider(provider);

        const container = new Container();
        container.bind(DecorationsService).toConstantValue(service);
        container.bind(ColorRegistry).toSelf().inSingletonScope();
        container.bind(FileTreeDecoratorAdapter).toSelf().inSingletonScope();
        adapter = container.get(FileTreeDecoratorAdapter);

        tree = createTree(fileUris);
    });

    afterEach(() => {
        service.dispose();
    });

    it('fetches decorations on demand for resources never mentioned in a change event', async () => {
        for (const uri of fileUris) {
            provider.decorations.set(uri, { letter: 'U', bubble: true });
        }

        // simulates a render: nothing decorated yet, but fetches are triggered
        expect(await adapter.decorations(tree)).to.have.lengthOf(0);
        await sleep(20);

        const decorations = await adapter.decorations(tree);
        for (const uri of fileUris) {
            expect(decorations.has(uri), uri).to.equal(true);
        }
    });

    it('does not re-query the provider for undecorated resources on repeated renders', async () => {
        await adapter.decorations(tree);
        await sleep(20);
        const queriesAfterFirstRender = provider.queried.length;

        await adapter.decorations(tree);
        await adapter.decorations(tree);
        await sleep(20);

        expect(provider.queried.length).to.equal(queriesAfterFirstRender);
    });

    it('recovers decorations of resources cached as undecorated after a flush event', async () => {
        // resources are queried before the provider has any data, e.g. before
        // the initial git status is computed
        await adapter.decorations(tree);
        await sleep(20);
        expect(await adapter.decorations(tree)).to.have.lengthOf(0);

        // data becomes available, but the change event exceeds the plugin-ext
        // event cap and arrives as a flush (see #17507)
        for (const uri of fileUris) {
            provider.decorations.set(uri, { letter: 'M' });
        }
        let treeInvalidated = false;
        adapter.onDidChangeDecorations(() => {
            treeInvalidated = true;
        });
        provider.fireDidChange(undefined);
        await sleep(20);
        expect(treeInvalidated, 'flush must invalidate the tree decorations').to.equal(true);

        // the invalidation makes the tree render, which re-fetches on demand ...
        await adapter.decorations(tree);
        await sleep(20);

        // ... and the next render shows every decoration
        const decorations = await adapter.decorations(tree);
        for (const uri of fileUris) {
            expect(decorations.get(uri)?.tailDecorations?.some(tail => 'data' in tail && tail.data === 'M'), uri).to.equal(true);
        }
    });

});
