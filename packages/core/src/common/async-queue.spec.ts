/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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
import { AsyncQueue } from './async-queue';

describe('AsyncQueue (10x ~100ms tasks)', () => {

    for (let i = 1; i <= 10; i++) {
        const maxConcurrency = i;
        it(`should only run ${maxConcurrency} async tasks concurrently`, async () => {
            const queue = new AsyncQueue({ concurrency: maxConcurrency });
            for (let j = 1; j <= 10; j++) {
                /** Current task number */
                const k = j;
                queue.push(async () => {
                    if (k <= maxConcurrency) {
                        // Tasks are scheduled right away because we are below to or equal to `maxConcurrency`
                        expect(queue.pendingCount).eq(0, 'incorrect pendingCount (k < maxConcurrency)');
                        expect(queue.runningCount).eq(k, 'incorrect runningCount (k < maxConcurrency)');
                    } else {
                        // The pending queue keeps growing because we are above `maxConcurrency`
                        expect(queue.pendingCount).eq(k - maxConcurrency - 1, 'incorrect pendingCount (k >= maxConcurrency)');
                        expect(queue.runningCount).eq(maxConcurrency, 'incorrect runningCount (k >= maxConcurrency)');
                    }
                    // "pseudo-work" that takes 100ms to process
                    await new Promise(resolve => setTimeout(resolve, 100));
                });
            }
            expect(queue.pendingCount).eq(10 - maxConcurrency, 'incorrect pendingCount (pre-close)');
            expect(queue.runningCount).eq(maxConcurrency, 'incorrect runningCount (pre-close)');
            await queue.close();
            expect(queue.pendingCount).eq(0, 'incorrect pendingCount (post-close)');
            expect(queue.runningCount).eq(0, 'incorrect runningCount (post-close)');
        });
    }
});
