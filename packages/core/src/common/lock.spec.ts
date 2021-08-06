/********************************************************************************
 * Copyright (C) 2021 Red Hat and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { expect } from 'chai';
import { Lock } from './lock';
import { wait } from './promise-util';

describe('Lock', () => {

    beforeEach(() => {

    });

    it('should block', async () => {
        const lock = new Lock();

        const results: number[] = [];

        const token1 = await lock.acquire().then(token => {
            results.push(2);
            return token;
        });

        const lock2 = lock.acquire().then(token => {
            results.push(1);
            return token;
        });

        await wait(1000);

        expect(results).members([2]);

        lock.release(token1);

        const token2 = await lock2;

        await wait(1000);
        expect(results).members([2, 1]);

        lock.release(token2);
    }).timeout(5000);
});
