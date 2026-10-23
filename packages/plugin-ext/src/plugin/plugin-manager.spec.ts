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
import { Deferred } from '@theia/core/lib/common/promise-util';
import { AbstractPluginManagerExtImpl } from './plugin-manager';

/** A plugin manager that activates test activations registered directly for activation events. */
class TestPluginManager extends AbstractPluginManagerExtImpl<{}> {

    constructor() {
        super();
        this.ready.resolve();
    }

    async $init(): Promise<void> { }

    protected isSupportedActivationEvent(): boolean {
        return true;
    }

    addActivation(activationEvent: string, activation: () => Promise<void>): void {
        this.setActivation(activationEvent, activation);
    }

    get pendingActivationCount(): number {
        return this['pendingActivationsByEvent'].size;
    }
}

/** Resolve to whether the promise has settled after pending callbacks have run. */
async function isSettled(promise: Promise<unknown>): Promise<boolean> {
    let settled = false;
    promise.then(() => settled = true, () => settled = true);
    await new Promise(resolve => setTimeout(resolve, 0));
    return settled;
}

describe('AbstractPluginManagerExtImpl - $activateByEvent', () => {

    it('lets a concurrent request for an event wait for the activation in flight', async () => {
        const manager = new TestPluginManager();
        const activation = new Deferred<void>();
        let activations = 0;
        manager.addActivation('onFileSystem:test', () => {
            activations++;
            return activation.promise;
        });

        const first = manager.$activateByEvent('onFileSystem:test');
        const second = manager.$activateByEvent('onFileSystem:test');

        expect(await isSettled(first)).to.be.false;
        expect(await isSettled(second)).to.be.false;

        activation.resolve();

        expect(await isSettled(first)).to.be.true;
        expect(await isSettled(second)).to.be.true;
        expect(activations).to.equal(1);
    });

    it('reports a failed activation only to the first request', async () => {
        const manager = new TestPluginManager();
        manager.addActivation('onFileSystem:test', () => Promise.reject(new Error('activation failed')));

        const first = manager.$activateByEvent('onFileSystem:test');
        const second = manager.$activateByEvent('onFileSystem:test');

        await first.then(() => { throw new Error('should have rejected'); }, () => undefined);
        await second;
    });

    it('resolves a request for an event that activates nothing', async () => {
        const manager = new TestPluginManager();
        expect(await isSettled(manager.$activateByEvent('onFileSystem:none'))).to.be.true;
    });

    it('forgets the activation of an event once it has settled', async () => {
        const manager = new TestPluginManager();
        const succeeding = new Deferred<void>();
        const failing = new Deferred<void>();
        manager.addActivation('onFileSystem:test', () => succeeding.promise);
        manager.addActivation('onFileSystem:failed', () => failing.promise);

        const activation = manager.$activateByEvent('onFileSystem:test');
        const failed = manager.$activateByEvent('onFileSystem:failed');
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(manager.pendingActivationCount).to.equal(2);

        succeeding.resolve();
        failing.reject(new Error('activation failed'));
        await activation;
        await failed.then(() => { throw new Error('should have rejected'); }, () => undefined);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(manager.pendingActivationCount).to.equal(0);
    });

    it('lets a concurrent request wait for a later batch of activations for the same event, too', async () => {
        const manager = new TestPluginManager();
        const first = new Deferred<void>();
        const second = new Deferred<void>();
        manager.addActivation('onFileSystem:test', () => first.promise);
        manager.$activateByEvent('onFileSystem:test');
        // A plugin deployed in the meantime is activated by the same event
        manager.addActivation('onFileSystem:test', () => second.promise);
        manager.$activateByEvent('onFileSystem:test');

        const request = manager.$activateByEvent('onFileSystem:test');
        first.resolve();
        expect(await isSettled(request)).to.be.false;
        second.resolve();
        expect(await isSettled(request)).to.be.true;
    });
});
