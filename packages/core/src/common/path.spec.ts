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
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/');
        assert.deepEqual(path.dir.toString(), '/foo/bar');
        assert.deepEqual(path.base, 'file.txt');
        assert.deepEqual(path.name, 'file');
        assert.deepEqual(path.ext, '.txt');
    });

    it("new from foo/bar/file.txt", () => {
        const path = new Path('foo/bar/file.txt');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, false);
        assert.deepEqual(path.root, undefined);
        assert.deepEqual(path.dir.toString(), 'foo/bar');
        assert.deepEqual(path.base, 'file.txt');
        assert.deepEqual(path.name, 'file');
        assert.deepEqual(path.ext, '.txt');
    });

    it("new from /foo", () => {
        const path = new Path('/foo');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/');
        assert.deepEqual(path.dir.toString(), '/');
        assert.deepEqual(path.base, 'foo');
        assert.deepEqual(path.name, 'foo');
        assert.deepEqual(path.ext, '');
    });

    it("new from foo", () => {
        const path = new Path('foo');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, false);
        assert.deepEqual(path.root, undefined);
        assert.deepEqual(path.dir.toString(), 'foo');
        assert.deepEqual(path.base, 'foo');
        assert.deepEqual(path.name, 'foo');
        assert.deepEqual(path.ext, '');
    });

    it("new from /", () => {
        const path = new Path('/');
        assert.deepEqual(path.isRoot, true);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/');
        assert.deepEqual(path.dir.toString(), '/');
        assert.deepEqual(path.base, '');
        assert.deepEqual(path.name, '');
        assert.deepEqual(path.ext, '');
    });

    it("new from /c:/foo/bar/file.txt", () => {
        const path = new Path('/c:/foo/bar/file.txt');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/c:');
        assert.deepEqual(path.dir.toString(), '/c:/foo/bar');
        assert.deepEqual(path.base, 'file.txt');
        assert.deepEqual(path.name, 'file');
        assert.deepEqual(path.ext, '.txt');
    });

    it("new from /c:/foo", () => {
        const path = new Path('/c:/foo');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/c:');
        assert.deepEqual(path.dir.toString(), '/c:');
        assert.deepEqual(path.base, 'foo');
        assert.deepEqual(path.name, 'foo');
        assert.deepEqual(path.ext, '');
    });

    it("new from /c:/", () => {
        const path = new Path('/c:/');
        assert.deepEqual(path.isRoot, false);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/c:');
        assert.deepEqual(path.dir.toString(), '/c:');
        assert.deepEqual(path.base, '');
        assert.deepEqual(path.name, '');
        assert.deepEqual(path.ext, '');
    });

    it("new from /c:", () => {
        const path = new Path('/c:');
        assert.deepEqual(path.isRoot, true);
        assert.deepEqual(path.isAbsolute, true);
        assert.deepEqual(path.root!.toString(), '/c:');
        assert.deepEqual(path.dir.toString(), '/c:');
        assert.deepEqual(path.base, 'c:');
        assert.deepEqual(path.name, 'c:');
        assert.deepEqual(path.ext, '');
    });

});
