/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
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

    describe("03 #appendPath", () => {

        it("Should return with this when the the segments array is empty.", () => {
            const uri = new URI("file:///foo");
            expect(uri.appendPath("").toString()).to.be.equal(uri.toString());
        });

        it("Should append a single segment.", () => {
            expect(new URI("file:///foo").appendPath("bar").toString()).to.be.equal("file:///foo/bar");
        });

        it("Should append multiple segments.", () => {
            expect(new URI("file:///foo").appendPath("bar/baz").toString()).to.be.equal("file:///foo/bar/baz");
        });

        it("Should append with the trailing path delimiter #01", () => {
            const uri = new URI("file:///");
            expect(uri.appendPath("").toString()).to.be.equal(uri.toString());
        });

        it("Should append with the trailing path delimiter #02", () => {
            expect(new URI("file:///").appendPath("bar").toString()).to.be.equal("file:///bar");
        });

        it("Should append with the trailing path delimiter #03", () => {
            expect(new URI("file:///").appendPath("bar/baz").toString()).to.be.equal("file:///bar/baz");
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

    describe("05 #withFragment", () => {

        it("Should replace the fragment.", () => {
            expect(new URI("file:///foo/bar/baz.txt#345345").withFragment("foo").toString()).equals("file:///foo/bar/baz.txt#foo");
            expect(new URI("file:///foo/bar/baz.txt?foo=2#345345").withFragment("foo").toString(true)).equals("file:///foo/bar/baz.txt?foo=2#foo");
        });

        it("Should remove the fragment.", () => {
            expect(new URI("file:///foo/bar/baz.txt#345345").withFragment("").toString()).equals("file:///foo/bar/baz.txt");
        });
    });

    describe("06 #toString()", () => {
        it("should produce the non encoded string", () => {
            function check(uri: string): void {
                expect(new URI(uri).toString(true)).equals(uri)
            }
            check('file:///X?test=32')
            check('file:///X?test=32#345')
            check('file:///X test/ddd?test=32#345')
        })
    })

    describe("07 #Uri.with...()", () => {
        it("produce proper URIs", () => {
            let uri = new URI().withScheme('file').withPath('/foo/bar.txt').withQuery("x=12").withFragment("baz")
            expect(uri.toString(true)).equals("file:///foo/bar.txt?x=12#baz")

            expect(uri.withoutScheme().toString(true)).equals("/foo/bar.txt?x=12#baz")

            expect(uri.withScheme("http").toString(true)).equals("http:/foo/bar.txt?x=12#baz")

            expect(uri.withoutQuery().toString(true)).equals("file:///foo/bar.txt#baz")

            expect(uri.withoutFragment().toString(true)).equals(uri.withFragment('').toString(true))

            expect(uri.withPath("hubba-bubba").toString(true)).equals("file://hubba-bubba?x=12#baz")
        })
    })
});
