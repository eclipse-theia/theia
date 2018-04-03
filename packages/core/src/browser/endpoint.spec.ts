/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Endpoint } from "@theia/core/src/browser/endpoint";

describe("Endpoint", () => {

    describe("01 #getWebSocketUrl", () => {

        test("Should correctly join root pathname", () => {
            expectWsUri(
                {
                    httpScheme: "ws",
                    path: "/miau/"
                },
                {
                    host: "example.org",
                    pathname: "/",
                    search: "",
                    protocol: ""
                }, "ws://example.org/miau/");
        });

        test("Should correctly join pathname and path", () => {
            expectWsUri(
                {
                    httpScheme: "ws",
                    path: "/miau/"
                },
                {
                    host: "example.org",
                    pathname: "/mainresource",
                    search: "",
                    protocol: ""
                }, "ws://example.org/mainresource/miau/");
        });

        test(
            "Should correctly join pathname and path, ignoring double slash in between",
            () => {
                expectWsUri(
                    {
                        httpScheme: "ws",
                        path: "/miau/"
                    },
                    {
                        host: "example.org",
                        pathname: "/mainresource/",
                        search: "",
                        protocol: ""
                    }, "ws://example.org/mainresource/miau/");
            }
        );

        test("Should correctly join pathname and path, without trailing slash", () => {
            expectWsUri(
                {
                    httpScheme: "ws",
                    path: "/miau"
                },
                {
                    host: "example.org",
                    pathname: "/mainresource",
                    search: "",
                    protocol: ""
                }, "ws://example.org/mainresource/miau");
        });
    });

    describe("02 #httpScheme", () => {

        test("Should choose https:// if location protocol is https://", () => {
            expectRestUri(
                {
                    path: "/"
                },
                {
                    host: "example.org",
                    pathname: "/",
                    search: "",
                    protocol: "https:"
                }, "https://example.org/");
        });
    });
});

function expectWsUri(options: Endpoint.Options, mockLocation: Endpoint.Location, expectedUri: string) {
    const cut = new Endpoint(options, mockLocation);
    const uri = cut.getWebSocketUrl();
    expect(uri.toString()).toEqual(expectedUri);
}

function expectRestUri(options: Endpoint.Options, mockLocation: Endpoint.Location, expectedUri: string) {
    const cut = new Endpoint(options, mockLocation);
    const uri = cut.getRestUrl();
    expect(uri.toString()).toEqual(expectedUri);
}
