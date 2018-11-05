/********************************************************************************
 * Copyright (C) 2018 YourCompany and others.
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

import * as PQueue from 'p-queue';
import { expect } from 'chai';

describe('p-queue', () => {

    it('tasks are executed sequentially when \'concurrency\' is \'1\'', async () => {
        const actual = [] as number[];
        const expected = [200, 10, 100, 50];
        const queue = new PQueue({ concurrency: 1 });
        const newTask = (value: number) => () => new Promise<number>(resolve => {
            setTimeout(() => {
                actual.push(value);
                resolve(value);
            }, value);
        });
        for (const value of expected) {
            queue.add(newTask(value));
        }
        await queue.onIdle();
        expect(expected).to.be.deep.equal(actual);
    });

});
