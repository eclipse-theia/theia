/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from "chai"
import URI from "./uri"

const expect = chai.expect;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
});

beforeEach(() => {
});

describe("uri", () => {

    describe("01 #getParent", () => {

        it("Should return the parent.", () => {
            expect(new URI("file:///foo/bar.txt").parent.toString()).equals("file:///foo");
        });

    });

    describe("02 #lastSegment", () => {

        it("Should return the last segment.", () => {
            expect(new URI("file:///foo").lastSegment).equals("foo");
            expect(new URI("file:///foo/bar.txt").lastSegment).equals("bar.txt");
        });

    });

    describe("03 #append", () => {

        it("Should return with this when the the segments array is empty.", () => {
            const uri = new URI("file:///foo");
            expect(uri.append("").toString()).to.be.equal(uri.toString());
        });

        it("Should append a single segment.", () => {
            expect(new URI("file:///foo").append("bar").toString()).to.be.equal("file:///foo/bar");
        });

        it("Should append multiple segments.", () => {
            expect(new URI("file:///foo").append("bar/baz").toString()).to.be.equal("file:///foo/bar/baz");
        });

    });

    describe("04 #path", () => {

        it("Should return with the FS path from the URI.", () => {
            expect(new URI("file:///foo/bar/baz.txt").path).equals("/foo/bar/baz.txt");
        });

        it("Should not return the encoded path", () => {
            expect(new URI("file:///foo 3/bar 4/baz 4.txt").path).equals("/foo 3/bar 4/baz 4.txt");
        })
    });

});
