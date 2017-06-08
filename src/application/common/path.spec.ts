/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as assert from 'assert';
import { Path } from "./path"

describe("Path", () => {

    it("new from /foo/bar/file.txt", () => {
        const path = new Path('/foo/bar/file.txt');
        assert.deepEqual(path.root, false);
        assert.deepEqual(path.absolute, true);
        assert.deepEqual(path.dir.toString(), '/foo/bar');
        assert.deepEqual(path.base, 'file.txt');
        assert.deepEqual(path.name, 'file');
        assert.deepEqual(path.ext, '.txt');
    });

    it("new from foo/bar/file.txt", () => {
        const path = new Path('foo/bar/file.txt');
        assert.deepEqual(path.root, false);
        assert.deepEqual(path.absolute, false);
        assert.deepEqual(path.dir.toString(), 'foo/bar');
        assert.deepEqual(path.base, 'file.txt');
        assert.deepEqual(path.name, 'file');
        assert.deepEqual(path.ext, '.txt');
    });

    it("new from /foo", () => {
        const path = new Path('/foo');
        assert.deepEqual(path.root, false);
        assert.deepEqual(path.absolute, true);
        assert.deepEqual(path.dir.toString(), '/');
        assert.deepEqual(path.base, 'foo');
        assert.deepEqual(path.name, 'foo');
        assert.deepEqual(path.ext, '');
    });

    it("new from foo", () => {
        const path = new Path('foo');
        assert.deepEqual(path.root, false);
        assert.deepEqual(path.absolute, false);
        assert.deepEqual(path.dir.toString(), 'foo');
        assert.deepEqual(path.base, 'foo');
        assert.deepEqual(path.name, 'foo');
        assert.deepEqual(path.ext, '');
    });

    it("new from /", () => {
        const path = new Path('/');
        assert.deepEqual(path.root, true);
        assert.deepEqual(path.absolute, true);
        assert.deepEqual(path.dir.toString(), '/');
        assert.deepEqual(path.base, '');
        assert.deepEqual(path.name, '');
        assert.deepEqual(path.ext, '');
    });

});
