/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import URI from "./uri";

describe("uri", () => {

    describe("#getParent", () => {

        test("of file:///foo/bar.txt", () => {
            expect(new URI("file:///foo/bar.txt").parent.toString()).toEqual("file:///foo");
        });

        test("of file:///foo/", () => {
            expect(new URI("file:///foo/").parent.toString()).toEqual("file:///foo");
        });

        test("of file:///foo", () => {
            expect(new URI("file:///foo").parent.toString()).toEqual("file:///");
        });

        test("of file:///", () => {
            expect(new URI("file:///").parent.toString()).toEqual("file:///");
        });

        test("of file://", () => {
            expect(new URI("file://").parent.toString()).toEqual("file://");
        });

    });

    describe("#lastSegment", () => {

        test("of file:///foo/bar.txt", () => {
            expect(new URI("file:///foo/bar.txt").path.base).toEqual("bar.txt");
        });

        test("of file:///foo", () => {
            expect(new URI("file:///foo").path.base).toEqual("foo");
        });

        test("of file:///", () => {
            expect(new URI("file:///").path.base).toEqual("");
        });

        test("of file://", () => {
            expect(new URI("file://").path.base).toEqual("");
        });

    });

    describe("#appendPath", () => {

        test("'' to file:///foo", () => {
            const uri = new URI("file:///foo");
            expect(uri.resolve("").toString()).toEqual(uri.toString());
        });

        test("bar to file:///foo", () => {
            expect(new URI("file:///foo").resolve("bar").toString()).toEqual("file:///foo/bar");
        });

        test("bar/baz to file:///foo", () => {
            expect(new URI("file:///foo").resolve("bar/baz").toString()).toEqual("file:///foo/bar/baz");
        });

        test("'' to file:///", () => {
            const uri = new URI("file:///");
            expect(uri.resolve("").toString()).toEqual(uri.toString());
        });

        test("bar to file:///", () => {
            expect(new URI("file:///").resolve("bar").toString()).toEqual("file:///bar");
        });

        test("bar/baz to file:///", () => {
            expect(new URI("file:///").resolve("bar/baz").toString()).toEqual("file:///bar/baz");
        });

    });

    describe("#path", () => {

        test("Should return with the FS path from the URI.", () => {
            expect(new URI("file:///foo/bar/baz.txt").path.toString()).toEqual("/foo/bar/baz.txt");
        });

        test("Should not return the encoded path", () => {
            expect(new URI("file:///foo 3/bar 4/baz 4.txt").path.toString()).toEqual("/foo 3/bar 4/baz 4.txt");
        });
    });

    describe("#withFragment", () => {

        test("Should replace the fragment.", () => {
            expect(new URI("file:///foo/bar/baz.txt#345345").withFragment("foo").toString()).toEqual("file:///foo/bar/baz.txt#foo");
            expect(new URI("file:///foo/bar/baz.txt?foo=2#345345").withFragment("foo").toString(true)).toEqual("file:///foo/bar/baz.txt?foo=2#foo");
        });

        test("Should remove the fragment.", () => {
            expect(new URI("file:///foo/bar/baz.txt#345345").withFragment("").toString()).toEqual("file:///foo/bar/baz.txt");
        });
    });

    describe("#toString()", () => {
        test("should produce the non encoded string", () => {
            function check(uri: string): void {
                expect(new URI(uri).toString(true)).toEqual(uri);
            }
            check('file:///X?test=32');
            check('file:///X?test=32#345');
            check('file:///X test/ddd?test=32#345');
        });
    });

    describe("#Uri.with...()", () => {
        test("produce proper URIs", () => {
            const uri = new URI().withScheme('file').withPath('/foo/bar.txt').withQuery("x=12").withFragment("baz");
            expect(uri.toString(true)).toEqual("file:///foo/bar.txt?x=12#baz");

            expect(uri.withoutScheme().toString(true)).toEqual("/foo/bar.txt?x=12#baz");

            expect(uri.withScheme("http").toString(true)).toEqual("http:/foo/bar.txt?x=12#baz");

            expect(uri.withoutQuery().toString(true)).toEqual("file:///foo/bar.txt#baz");

            expect(uri.withoutFragment().toString(true)).toEqual(uri.withFragment('').toString(true));

            expect(uri.withPath("hubba-bubba").toString(true)).toEqual("file://hubba-bubba?x=12#baz");
        });
    });
});
