/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as assert from "assert";
import { ReferenceCollection } from './reference';
import { Disposable } from "./disposable";

describe('reference', () => {

    it('dispose a single reference', async () => {
        const expectation: { disposed: boolean } = { disposed: false };
        const references = new ReferenceCollection<string, Disposable>(key => ({
            key, dispose: () => {
                expectation.disposed = true;
            }
        }));
        assert.ok(!references.has("a"));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), []);

        const reference = await references.acquire("a");
        assert.ok(references.has("a"));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), ["a"]);

        reference.dispose();
        assert.ok(!references.has("a"));
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
        assert.ok(!references.has("a"));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), []);

        const reference = await references.acquire("a");
        const reference2 = await references.acquire("a");
        assert.ok(references.has("a"));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), ["a"]);

        reference.dispose();
        assert.ok(references.has("a"));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), ["a"]);

        reference2.dispose();
        assert.ok(!references.has("a"));
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
        assert.ok(!references.has("a"));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), []);

        await references.acquire("a");
        const reference = await references.acquire("a");
        assert.ok(references.has("a"));
        assert.ok(!expectation.disposed);
        assert.deepEqual(references.keys(), ["a"]);

        reference.object.dispose();
        assert.ok(!references.has("a"));
        assert.ok(expectation.disposed);
        assert.deepEqual(references.keys(), []);
    });

});
