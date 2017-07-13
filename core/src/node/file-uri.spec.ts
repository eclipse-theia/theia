/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as os from "os";
import * as path from "path";
import * as chai from "chai";
import { FileUri } from "./file-uri";

const expect = chai.expect;

describe("file-uri", () => {

    const filePaths: string[] = ["with.txt", "with spaces.txt", "with:colon.txt", "with_Ö.txt"].map(filePath => path.join(os.tmpdir(), "file-uri-folder", filePath));

    it("create -> fsPath -> create should be symmetric", () => {
        const orderedPaths = filePaths.map(filePath => filePath.toLowerCase()).sort();
        expect(orderedPaths.map(filePath => FileUri.create(filePath)).map(uri => FileUri.fsPath(uri).toLowerCase()).sort()).to.be.deep.equal(orderedPaths);
    });

    it("fsPath -> create -> fsPath should be symmetric", () => {
        filePaths.forEach(filePath => {
            const expectedUri = FileUri.create(filePath);
            const convertedPath = FileUri.fsPath(expectedUri);
            const actualUri = FileUri.create(convertedPath);
            expect(actualUri.toString()).to.be.equal(expectedUri.toString());
        });
    });

    it('from /', () => {
        const uri = FileUri.create('/');
        expect(uri.toString(true)).to.be.equal('file:///');
    });

    it('from //', () => {
        const uri = FileUri.create('//');
        expect(uri.toString(true)).to.be.equal('file:///');
    });

    it('from c:', () => {
        const uri = FileUri.create('c:');
        expect(uri.toString(true)).to.be.equal('file:///c:');
    });

    it('from /c:', () => {
        const uri = FileUri.create('/c:');
        expect(uri.toString(true)).to.be.equal('file:///c:');
    });

    it('from /c:/', () => {
        const uri = FileUri.create('/c:/');
        expect(uri.toString(true)).to.be.equal('file:///c:/');
    });

})