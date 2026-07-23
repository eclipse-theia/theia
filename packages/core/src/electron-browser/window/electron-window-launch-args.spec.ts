// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { ElectronWindowLaunchArgs } from './electron-window-launch-args';

class TestElectronWindowLaunchArgs extends ElectronWindowLaunchArgs {
    redeemCalls = 0;
    constructor(protected launchId: string | undefined, protected result: string[] | Error) {
        super();
    }

    protected override getLaunchId(): string | undefined {
        return this.launchId;
    }

    protected override redeemFromMain(launchId: string): Promise<string[]> {
        this.redeemCalls++;
        if (this.result instanceof Error) {
            return Promise.reject(this.result);
        }
        return Promise.resolve(this.result);
    }
}

describe('ElectronWindowLaunchArgs', () => {

    it('returns undefined for a cold-start window (no launch id)', async () => {
        const service = new TestElectronWindowLaunchArgs(undefined, ['--attach-container', 'B']);
        expect(await service.getLaunchArgs()).to.be.undefined;
        expect(service.redeemCalls).to.equal(0);
    });

    it('redeems the forwarded argv when a launch id is present', async () => {
        const argv = ['--attach-container', 'B', '--session-preference', 'foo=1'];
        const service = new TestElectronWindowLaunchArgs('nonce-1', argv);
        expect(await service.getLaunchArgs()).to.deep.equal(argv);
    });

    it('redeems only once even when called concurrently and repeatedly', async () => {
        const service = new TestElectronWindowLaunchArgs('nonce-1', ['--attach-container', 'B']);
        const [a, b] = await Promise.all([service.getLaunchArgs(), service.getLaunchArgs()]);
        const c = await service.getLaunchArgs();
        expect(a).to.deep.equal(['--attach-container', 'B']);
        expect(b).to.deep.equal(a);
        expect(c).to.deep.equal(a);
        expect(service.redeemCalls).to.equal(1);
    });

    it('treats a redemption failure as a forwarded window with no args (does not fall back)', async () => {
        const service = new TestElectronWindowLaunchArgs('nonce-1', new Error('ipc failed'));
        expect(await service.getLaunchArgs()).to.deep.equal([]);
    });
});
