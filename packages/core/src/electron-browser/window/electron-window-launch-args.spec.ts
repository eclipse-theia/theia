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
    constructor(protected result: string[] | undefined | Error) {
        super();
    }

    protected override redeemFromMain(): Promise<string[] | undefined> {
        this.redeemCalls++;
        if (this.result instanceof Error) {
            return Promise.reject(this.result);
        }
        return Promise.resolve(this.result);
    }
}

describe('ElectronWindowLaunchArgs', () => {

    it('returns undefined for a cold-start window (main has no stored argv)', async () => {
        const service = new TestElectronWindowLaunchArgs(undefined);
        expect(await service.getLaunchArgs()).to.be.undefined;
    });

    it('redeems the forwarded argv for a claimed window', async () => {
        const argv = ['--attach-container', 'B', '--session-preference', 'foo=1'];
        const service = new TestElectronWindowLaunchArgs(argv);
        expect(await service.getLaunchArgs()).to.deep.equal(argv);
    });

    it('redeems only once per page load even when called concurrently and repeatedly', async () => {
        const service = new TestElectronWindowLaunchArgs(['--attach-container', 'B']);
        const [a, b] = await Promise.all([service.getLaunchArgs(), service.getLaunchArgs()]);
        const c = await service.getLaunchArgs();
        expect(a).to.deep.equal(['--attach-container', 'B']);
        expect(b).to.deep.equal(a);
        expect(c).to.deep.equal(a);
        expect(service.redeemCalls).to.equal(1);
    });

    it('treats a redemption failure as "no forwarded args" (falls back to the backend)', async () => {
        const service = new TestElectronWindowLaunchArgs(new Error('ipc failed'));
        expect(await service.getLaunchArgs()).to.be.undefined;
    });
});
