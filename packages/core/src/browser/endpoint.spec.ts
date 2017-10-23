/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import { Endpoint } from "@theia/core/src/browser/endpoint";

const expect = chai.expect;

describe("Endpoint", () => {

    before(() => {
        chai.config.showDiff = true;
        chai.config.includeStack = true;
    });

    describe("01 #getWebSocketUrl", () => {

        it("Should correctly join root pathname", () => {
            expectUri(
                {
                    httpScheme: "ws",
                    path: "/miau/"
                },
                {
                    host: "example.org",
                    pathname: "/",
                    search: "",
                    protocol: ""
                }, "ws://example.org/miau/")
        });

        it("Should correctly join pathname and path", () => {
            expectUri(
                {
                    httpScheme: "ws",
                    path: "/miau/"
                },
                {
                    host: "example.org",
                    pathname: "/mainresource",
                    search: "",
                    protocol: ""
                }, "ws://example.org/mainresource/miau/")
        });

        it("Should correctly join pathname and path, ignoring double slash in between", () => {
            expectUri(
                {
                    httpScheme: "ws",
                    path: "/miau/"
                },
                {
                    host: "example.org",
                    pathname: "/mainresource/",
                    search: "",
                    protocol: ""
                }, "ws://example.org/mainresource/miau/")
        });

        it("Should correctly join pathname and path, without trailing slash", () => {
            expectUri(
                {
                    httpScheme: "ws",
                    path: "/miau"
                },
                {
                    host: "example.org",
                    pathname: "/mainresource",
                    search: "",
                    protocol: ""
                }, "ws://example.org/mainresource/miau")
        });
    });
});

function expectUri(options: Endpoint.Options, mockLocation: Endpoint.Location, expectedUri: string) {
    const cut = new Endpoint(options, mockLocation)
    const uri = cut.getWebSocketUrl()
    expect(uri.toString()).to.eq(expectedUri)
}
