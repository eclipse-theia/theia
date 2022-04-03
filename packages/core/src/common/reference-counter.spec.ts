// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable no-unused-expressions */

import { expect } from 'chai';
import { Disposable } from './disposable';
import { DefaultRc } from './reference-counter';
import { wait } from './promise-util';

class TestDisposable implements Disposable {

    disposedCount = 0;

    dispose(): void {
        this.disposedCount += 1;
    }
}

describe('DefaultRc', () => {

    it('should only dispose once all references are disposed', () => {
        const disposable = new TestDisposable();
        const rc1 = DefaultRc.New(disposable);
        const rc2 = rc1.clone();
        rc1.dispose();
        expect(disposable.disposedCount).eq(0);
        rc2.dispose();
        expect(disposable.disposedCount).eq(1);
    });

    it('should be able to delay actual disposal (1s)', async () => {
        let timeout: Promise<void> | undefined;
        const disposable = new TestDisposable();
        // wait for 1s when all references are disposed
        const rc1 = DefaultRc.New(disposable, dispose => {
            timeout = wait(1000).then(() => dispose());
        });
        const rc2 = rc1.clone();
        expect(timeout).undefined;
        rc1.dispose();
        expect(timeout).undefined;
        rc2.dispose();
        // at this point the timeout should have started
        expect(timeout).not.undefined;
        expect(disposable.disposedCount).eq(0);
        await wait(500);
        // timeout should still be going
        expect(disposable.disposedCount).eq(0);
        await timeout;
        // the timeout should have completed and disposed our instance
        expect(disposable.disposedCount).eq(1);
    });

    it('should be able to revive (0.5s)', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let timeout: any | undefined;
        const disposable = new TestDisposable();
        // wait for 1s when all references are disposed
        // clear the timeout on revive
        const rc1 = DefaultRc.New(disposable, dispose => {
            timeout = setTimeout(dispose, 1000);
            return () => {
                clearTimeout(timeout);
                timeout = undefined;
            };
        });
        const rc2 = rc1.clone();
        expect(timeout).undefined;
        rc1.dispose();
        expect(timeout).undefined;
        rc2.dispose();
        // at this point the timeout should have started
        expect(timeout).not.undefined;
        expect(disposable.disposedCount).eq(0);
        await wait(500);
        // timeout should still be going
        expect(timeout).not.undefined;
        expect(disposable.disposedCount).eq(0);
        // triggering a revive should clear the timeout
        const rc3 = rc2.clone();
        expect(timeout).undefined;
        // cleanup
        rc3.dispose();
        expect(timeout).not.undefined;
        clearTimeout(timeout);
    });
});
