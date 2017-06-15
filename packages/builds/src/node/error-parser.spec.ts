/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { IErrorParser, IErrorMatcher, IErrorPattern } from "./error-parser";
import * as fs from 'fs';
import * as stream from 'stream';
import * as chai from "chai";
import "mocha";
import * as chaiAsPromised from "chai-as-promised";
import { BuildUtils } from "./build-spec-utils";
import * as path from "path";

import { testContainer } from "./inversify.spec-config";

chai.use(chaiAsPromised);
const expect = chai.expect;

// tsc error pattern
// const tscErrorPattern: IErrorPattern = {
//     "patternName": "gnu-c-cpp compiler",
//     "regexp": '(.*)\s\(([\d,]+)\):\s(.*)\((\d+)\)',
//     "fileGroup": 1,
//     "locationGroup": 2,
//     "severityGroup": 99,
//     "codeGroup": 4,
//     "messageGroup": 3
// };
// const tscErrorMatcher: IErrorMatcher = {
//     "name": "TypeScript compiler",
//     "label": "TypeScript errors",
//     "owner": "tsc",
//     "fileLocation": "relative",
//     "pattern": tscErrorPattern
// };


// gcc/g++ compiler
const gccErrorPattern: IErrorPattern = {
    "patternName": "gnu-c-cpp compiler",
    "regexp": '(.*?):(\\d+:\\d+):?\\s*([Ee]rror|ERROR|[Ww]arning): (.*)',
    "fileGroup": 1,
    "locationGroup": 2,
    "severityGroup": 3,
    "codeGroup": 99,
    "messageGroup": 4
};
const gccErrorMatcher: IErrorMatcher = {
    "name": "gnu-c-cpp compiler",
    "label": "gcc/g++ errors",
    "owner": "gnu-c-cpp",
    "fileLocation": "relative",
    "pattern": gccErrorPattern
};

// gcc/g++ linker
const gccLinkerErrorPattern: IErrorPattern = {
    "patternName": "gnu-c-cpp linker",
    "regexp": '(.*):(\\d+):\\s(.*\\s[tof]+\\s`.*\')',
    "fileGroup": 1,
    "locationGroup": 2,
    "severityGroup": 99,
    "codeGroup": 99,
    "messageGroup": 3
};
const gccLinkerErrorMatcher: IErrorMatcher = {
    "name": "gnu-c-cpp linker",
    "label": "gcc/g++ errors",
    "owner": "gnu-c-cpp",
    "fileLocation": "absolute",
    "pattern": gccLinkerErrorPattern
};


describe("error-parser", () => {
    let parser: IErrorParser;
    beforeEach(function () {
        parser = testContainer.get<IErrorParser>(IErrorParser);
    });

    describe('parse simple gcc error log', () => {
        it('verify compiler errors and warning are found', () => {
            const logName: String = '/test-resources/' + 'error.txt';
            const readStream: NodeJS.ReadableStream = fs.createReadStream(__dirname + logName);
            const promise = parser.parse(gccErrorMatcher, readStream);
            const expectedFileName = path.resolve(__dirname, 'regex.c');

            return expect(promise).to.eventually.deep.equal(
                [{
                    "file": expectedFileName,
                    "location": "280:4",
                    "severity": "error",
                    "message": '‘spatule’ undeclared (first use in this function)',
                    "code": undefined
                },
                {
                    "file": expectedFileName,
                    "location": "281:4",
                    "severity": "error",
                    "message": 'expected ‘;’ before ‘register’',
                    "code": undefined
                },
                {
                    "file": expectedFileName,
                    "location": "288:9",
                    "severity": "error",
                    "message": '‘c’ undeclared (first use in this function)',
                    "code": undefined
                },
                {
                    "file": expectedFileName,
                    "location": "282:8",
                    "message": "unused variable ‘spatule’ [-Wunused-variable]",
                    "severity": "warning",
                    "code": undefined
                }
                ]
            );

        });

        it('verify linker error is found', () => {
            const logName: String = '/test-resources/' + 'linker.txt';
            const readStream: NodeJS.ReadableStream = fs.createReadStream(__dirname + logName);
            const promise = parser.parse(gccLinkerErrorMatcher, readStream);

            return expect(promise).to.eventually.deep.equal(
                [{
                    "file": "/tmp/gdb-8.0/zlib/inflate.c",
                    "location": "118",
                    "message": "undefined reference to `SPATULE'",
                    "severity": undefined,
                    "code": undefined
                }
                ]
            );
        });

        it('verify we handle parser input stream emiting "error"', () => {
            const mockedStream: NodeJS.ReadableStream = new stream.Readable();
            const promise = parser.parse(gccLinkerErrorMatcher, mockedStream);
            const errorMessage = 'this is a test error';
            mockedStream.emit('error', errorMessage);

            return expect(promise).to.eventually.be.rejectedWith(errorMessage);
        });


        // it('verify we can parse tsc error', () => {
        //     const tscError: string = "src/node/error-parser.spec.ts (31,4): Cannot find name 'z'. (2304)\n";
        //     const mockedStream: NodeJS.ReadableStream = new stream.Readable();
        //     mockedStream{'_read' } = function () { };

        //     const promise = parser.parse(tscErrorMatcher, mockedStream);
        //     mockedStream.emit('data', tscError);
        //     mockedStream.emit('end');

        //     return expect(promise).to.eventually.deep.equal(
        //         [{
        //             "file": "",
        //             "location": "",
        //             "message": "",
        //             "severity": "",
        //             "code": ""
        //         }
        //         ]
        //     );
        // });
    });

    describe('parse large gcc build log', () => {
        it('verify compiler error is found', () => {
            const logName: String = '/test-resources/' + 'largeOutput.txt';
            const readStream: NodeJS.ReadableStream = fs.createReadStream(__dirname + logName);
            const promise = parser.parse(gccErrorMatcher, readStream);
            const expectedFileName = path.resolve(__dirname, 'remote-utils.c');

            return expect(promise).to.eventually.deep.equal(
                [{
                    "file": expectedFileName,
                    "location": "1455:22",
                    "severity": "error",
                    "message": '‘p’ was not declared in this scope',
                    "code": undefined
                }
                ]
            );
        });
    });


    describe('parse gcc build log, catch entries as they are parsed', () => {
        const logName: String = '/test-resources/' + 'error.txt';
        let readStream: NodeJS.ReadableStream;
        const expectedFileName = path.resolve(__dirname, 'regex.c');

        beforeEach(() => {
            readStream = fs.createReadStream(__dirname + logName);
        });

        it('verify parser emits "error-found" events as entries are parsed', () => {
            parser.parse(gccErrorMatcher, readStream);

            // we expect 4 errors/warnings to be found
            const promise = BuildUtils.waitForNamedEventCount(parser, 'error-found', 4);

            return expect(promise).to.eventually.be.deep.equal(
                [
                    {
                        "file": expectedFileName,
                        "location": "280:4",
                        "severity": "error",
                        "message": '‘spatule’ undeclared (first use in this function)',
                        "code": undefined
                    },
                    {
                        "file": expectedFileName,
                        "location": "281:4",
                        "severity": "error",
                        "message": 'expected ‘;’ before ‘register’',
                        "code": undefined
                    },
                    {
                        "file": expectedFileName,
                        "location": "288:9",
                        "severity": "error",
                        "message": '‘c’ undeclared (first use in this function)',
                        "code": undefined
                    },
                    {
                        "file": expectedFileName,
                        "location": "282:8",
                        "message": "unused variable ‘spatule’ [-Wunused-variable]",
                        "severity": "warning",
                        "code": undefined
                    }
                ]
            );

        });

        it('verify parser emits event "done" when parsing is done', () => {
            parser.parse(gccErrorMatcher, readStream);
            const promise = BuildUtils.waitForNamedEvent(parser, 'done');

            return expect(promise).to.eventually.be.deep.equal(
                {}
            );

        });

    });

});

