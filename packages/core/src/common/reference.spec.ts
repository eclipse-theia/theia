/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import * as assert from 'assert';
import { ReferenceCollection } from './reference';
import { Disposable } from './disposable';

describe('reference', () => {

    it('dispose a single reference', async () => {
        const expectation: { disposed: boolean } = { disposed: false };
        const references = new ReferenceCollection<string, Disposable>(key => ({
            key, dispose: () => {
                expectation.disposed = true;
            }
        }));
        assert.ok(!references.has('a'));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), []);

        const reference = await references.acquire('a');
        assert.ok(references.has('a'));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), ['a']);

        reference.dispose();
        assert.ok(!references.has('a'));
        assert.ok(expectation.disposed);
        assert.deepEqual(references.keys(), []);
    });

    it('dispose 2 references', async () => {
        const expectation: { disposed: boolean } = { disposed: false };
        const references = new ReferenceCollection<string, Disposable>(key => ({
            key, dispose: () => {
                expectation.disposed = true;
            }
        }));
        assert.ok(!references.has('a'));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), []);

        const reference = await references.acquire('a');
        const reference2 = await references.acquire('a');
        assert.ok(references.has('a'));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), ['a']);

        reference.dispose();
        assert.ok(references.has('a'));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), ['a']);

        reference2.dispose();
        assert.ok(!references.has('a'));
        assert.ok(expectation.disposed);
        assert.deepEqual(references.keys(), []);
    });

    it('dispose an object with 2 references', async () => {
        const expectation: { disposed: boolean } = { disposed: false };
        const references = new ReferenceCollection<string, Disposable>(key => ({
            key, dispose: () => {
                expectation.disposed = true;
            }
        }));
        assert.ok(!references.has('a'));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), []);

        await references.acquire('a');
        const reference = await references.acquire('a');
        assert.ok(references.has('a'));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), ['a']);

        reference.object.dispose();
        assert.ok(!references.has('a'));
        assert.ok(expectation.disposed);
        assert.deepEqual(references.keys(), []);
    });

    it("shouldn't call onWillDispose event on create", async () => {
        const expectation: { disposed: boolean } = { disposed: false };
        const references = new ReferenceCollection<string, Disposable>(key => ({
            key, dispose: () => {
            }
        }));
        assert.ok(!references.has('a'));
        assert.ok(!expectation.disposed);
        references.onWillDispose(e => {
            expectation.disposed = true;
        });
        await references.acquire('a');
        assert.ok(!expectation.disposed);

        const reference = await references.acquire('a');
        reference.object.dispose();
        assert.ok(expectation.disposed);
    });

    it('the same object should be provided by an async factory for the same key', async () => {
        const references = new ReferenceCollection<string, Disposable>(async key => ({
            key, dispose: () => {
            }
        }));
        const result = await Promise.all([...Array(10).keys()].map(() => references.acquire('a')));
        result.forEach(v => assert.ok(result[0].object === v.object));
    });

});
