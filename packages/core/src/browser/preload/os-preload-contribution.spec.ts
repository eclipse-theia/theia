// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import { OS, OSBackendProvider } from '../../common/os.js';
import { OSPreloadContribution } from './os-preload-contribution.js';

class TestOSPreloadContribution extends OSPreloadContribution {

    requests = 0;

    protected override readonly osBackendProvider: OSBackendProvider = {
        getBackendOS: async () => {
            this.requests++;
            return this.backendOS;
        }
    };

    constructor(protected readonly backendLocal: boolean, protected readonly backendOS: OS.Type) {
        super();
    }

    protected override isBackendLocal(): boolean {
        return this.backendLocal;
    }
}

describe('OSPreloadContribution', () => {

    const original = { ...OS.backend };

    afterEach(() => {
        Object.assign(OS.backend, original);
    });

    it('does not ask a local backend for its OS', async () => {
        const contribution = new TestOSPreloadContribution(true, OS.Type.Windows);
        await contribution.initialize();
        expect(contribution.requests).to.equal(0);
        expect(OS.backend.type()).to.equal(OS.type());
    });

    it('takes the OS of a remote backend from the backend', async () => {
        const remoteOS = OS.type() === OS.Type.Windows ? OS.Type.Linux : OS.Type.Windows;
        const contribution = new TestOSPreloadContribution(false, remoteOS);
        await contribution.initialize();
        expect(contribution.requests).to.equal(1);
        expect(OS.backend.type()).to.equal(remoteOS);
        expect(OS.backend.isWindows).to.equal(remoteOS === OS.Type.Windows);
        expect(OS.backend.EOL).to.equal(remoteOS === OS.Type.Windows ? '\r\n' : '\n');
    });
});
