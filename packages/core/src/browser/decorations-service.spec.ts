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

import { expect } from 'chai';
import { CancellationToken, Emitter, Event } from '../common';
import URI from '../common/uri';
import { Decoration, DecorationsProvider, DecorationsServiceImpl } from './decorations-service';

class TestDecorationsProvider implements DecorationsProvider {

    protected readonly onDidChangeEmitter = new Emitter<URI[] | undefined>();
    readonly decorations = new Map<string, Decoration>();
    readonly queried: string[] = [];
    asynchronous = true;

    get onDidChange(): Event<URI[] | undefined> {
        return this.onDidChangeEmitter.event;
    }

    fireDidChange(uris?: URI[]): void {
        this.onDidChangeEmitter.fire(uris);
    }

    provideDecorations(uri: URI, token: CancellationToken): Decoration | Promise<Decoration | undefined> | undefined {
        this.queried.push(uri.toString());
        const decoration = this.decorations.get(uri.toString());
        return this.asynchronous ? Promise.resolve(decoration) : decoration;
    }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

describe('DecorationsServiceImpl', () => {

    const uriA = new URI('file:///project/a.ts');
    const uriB = new URI('file:///project/b.ts');

    let service: DecorationsServiceImpl;
    let provider: TestDecorationsProvider;
    let events: Map<string, Decoration>[];

    beforeEach(() => {
        service = new DecorationsServiceImpl();
        provider = new TestDecorationsProvider();
        service.registerDecorationsProvider(provider);
        events = [];
        service.onDidChangeDecorations(event => events.push(event));
    });

    afterEach(() => {
        service.dispose();
    });

    it('resolves decorations of synchronous providers on first query', () => {
        provider.asynchronous = false;
        provider.decorations.set(uriA.toString(), { letter: 'M' });
        const result = service.getDecoration(uriA, false);
        expect(result).to.have.lengthOf(1);
        expect(result[0].letter).to.equal('M');
    });

    it('caches "no decoration" results and does not query the provider again', async () => {
        expect(service.getDecoration(uriA, false)).to.have.lengthOf(0);
        await sleep(20);
        expect(provider.queried).to.have.lengthOf(1);

        expect(service.getDecoration(uriA, false)).to.have.lengthOf(0);
        await sleep(20);
        expect(provider.queried).to.have.lengthOf(1);
    });

    it('does not fire an event when an unknown resource resolves to no decoration', async () => {
        service.getDecoration(uriA, false);
        await sleep(20);
        expect(events).to.have.lengthOf(0);
    });

    it('fires a single batched event for resolutions of the same tick', async () => {
        provider.decorations.set(uriA.toString(), { letter: 'A' });
        provider.decorations.set(uriB.toString(), { letter: 'B' });

        service.getDecoration(uriA, false);
        service.getDecoration(uriB, false);
        await sleep(20);

        expect(events).to.have.lengthOf(1);
        expect(events[0].get(uriA.toString())?.letter).to.equal('A');
        expect(events[0].get(uriB.toString())?.letter).to.equal('B');

        const cached = service.getDecoration(uriA, false);
        expect(cached).to.have.lengthOf(1);
        expect(cached[0].letter).to.equal('A');
    });

    it('re-fetches a resource when the provider signals a change for it', async () => {
        provider.decorations.set(uriA.toString(), { letter: 'A' });
        service.getDecoration(uriA, false);
        await sleep(20);
        events.length = 0;
        const queriesAfterWarmUp = provider.queried.length;

        provider.decorations.set(uriA.toString(), { letter: 'D' });
        provider.fireDidChange([uriA]);
        await sleep(20);

        expect(provider.queried.length).to.be.greaterThan(queriesAfterWarmUp);
        expect(events).to.have.lengthOf(1);
        expect(events[0].get(uriA.toString())?.letter).to.equal('D');
        expect(service.getDecoration(uriA, false)[0].letter).to.equal('D');
    });

    it('fires an event when a decoration is removed', async () => {
        provider.decorations.set(uriA.toString(), { letter: 'A' });
        service.getDecoration(uriA, false);
        await sleep(20);
        events.length = 0;

        provider.decorations.delete(uriA.toString());
        provider.fireDidChange([uriA]);
        await sleep(20);

        expect(events).to.have.lengthOf(1);
        expect(events[0].has(uriA.toString())).to.equal(false);
        expect(service.getDecoration(uriA, false)).to.have.lengthOf(0);
    });

    it('drops all cached data on a flush event and re-fetches on demand', async () => {
        provider.decorations.set(uriA.toString(), { letter: 'A' });
        service.getDecoration(uriA, false);
        service.getDecoration(uriB, false);
        await sleep(20);
        events.length = 0;
        const queriesAfterWarmUp = provider.queried.length;

        provider.fireDidChange(undefined);
        await sleep(20);
        // the flush itself announces an unspecified change with an empty payload
        expect(events).to.have.lengthOf(1);
        expect(events[0].size).to.equal(0);

        service.getDecoration(uriA, false);
        service.getDecoration(uriB, false);
        await sleep(20);
        expect(provider.queried.length).to.equal(queriesAfterWarmUp + 2);
        expect(service.getDecoration(uriA, false)[0].letter).to.equal('A');
    });

});
